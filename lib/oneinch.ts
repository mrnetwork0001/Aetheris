/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SERVER-ONLY MODULE — 1inch Swap API v6.0 (multi-chain treasury rebalancing).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every request carries `Authorization: Bearer ${ONEINCH_API_KEY}`. That key is a
 * secret and must NEVER reach the browser, so all exported network functions call
 * `assertServerOnly()` and are intended to be reached from Route Handlers only.
 * (`SUPPORTED_CHAINS` is a plain constant and is safe to import anywhere.)
 *
 * Endpoints used:
 *   • GET {base}/swap/v6.0/{chainId}/quote
 *   • GET {base}/swap/v6.0/{chainId}/swap
 *   • GET {base}/balance/v1.2/{chainId}/balances/{wallet}
 */

import { assertServerOnly, optionalEnv, requireEnv } from './env';

/** EVM chains Aetheris will route treasury swaps through via 1inch. */
export const SUPPORTED_CHAINS: readonly { id: number; name: string }[] = [
  { id: 1, name: 'Ethereum' },
  { id: 42161, name: 'Arbitrum' },
  { id: 8453, name: 'Base' },
  { id: 10, name: 'Optimism' },
  { id: 137, name: 'Polygon' },
] as const;

/** Normalized quote returned to the Aetheris rebalancer / UI. */
export type SwapQuote = {
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstAmount: string;
  estimatedGas: string;
  protocols: unknown;
};

/** Sentinel address 1inch uses for a chain's native asset (ETH, MATIC, …). */
export const NATIVE_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const SWAP_API_VERSION = 'v6.0';
const BALANCE_API_VERSION = 'v1.2';
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 600;

/** Error carrying the 1inch HTTP status and its (readable) response body. */
export class OneInchApiError extends Error {
  readonly name = 'OneInchApiError';
  readonly status: number;
  readonly endpoint: string;
  readonly body: string;

  constructor(endpoint: string, status: number, body: string, description?: string) {
    super(
      `1inch ${endpoint} failed with HTTP ${status}` +
        (description ? `: ${description}` : body ? `: ${body.slice(0, 400)}` : ''),
    );
    this.status = status;
    this.endpoint = endpoint;
    this.body = body;
  }
}

/** Raw v6.0 `/quote` response (only the fields we consume are modelled). */
type RawQuoteResponse = {
  dstAmount?: string;
  gas?: number | string;
  protocols?: unknown;
};

/** Raw v6.0 `/swap` response (only the fields we consume are modelled). */
type RawSwapResponse = {
  dstAmount?: string;
  tx?: {
    from?: string;
    to?: string;
    data?: string;
    value?: string;
    gas?: number | string;
    gasPrice?: string;
  };
};

/** Shape of a 1inch error payload across both APIs. */
type OneInchErrorBody = {
  error?: string;
  description?: string;
  statusCode?: number;
  meta?: unknown;
};

/**
 * Assert a chain id is one Aetheris supports.
 *
 * @param chainId - EVM chain id.
 * @throws {OneInchApiError} With status 400 when the chain is unsupported.
 */
function assertSupportedChain(chainId: number): void {
  if (!SUPPORTED_CHAINS.some((c) => c.id === chainId)) {
    throw new OneInchApiError(
      'chain-validation',
      400,
      '',
      `Unsupported chainId ${chainId}. Supported: ${SUPPORTED_CHAINS.map(
        (c) => `${c.name} (${c.id})`,
      ).join(', ')}`,
    );
  }
}

/** Sleep helper used by the bounded backoff loop. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Perform an authenticated GET against api.1inch.dev with bounded retry/backoff.
 *
 * Retries on 429 (honouring `Retry-After`) and on 5xx / network faults, up to
 * {@link MAX_RETRIES} attempts with exponential backoff. 4xx bodies are parsed
 * and re-thrown verbatim so callers see 1inch's own explanation
 * (e.g. "insufficient liquidity", "Not enough allowance").
 *
 * @param path - Path beneath the API origin, starting with `/`.
 * @param params - Query string parameters.
 * @returns The parsed JSON body.
 * @throws {OneInchApiError} On any non-OK response after retries are exhausted.
 */
async function oneInchGet<T>(path: string, params: Record<string, string>): Promise<T> {
  assertServerOnly('lib/oneinch.ts');

  const apiKey = requireEnv(
    'ONEINCH_API_KEY',
    'Create a free key at https://portal.1inch.dev and set ONEINCH_API_KEY.',
  );
  const base = optionalEnv('NEXT_PUBLIC_ONEINCH_BASE_URL', 'https://api.1inch.dev').replace(
    /\/+$/,
    '',
  );
  const url = `${base}${path}?${new URLSearchParams(params).toString()}`;

  let lastError: OneInchApiError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        cache: 'no-store',
      });
    } catch (cause) {
      lastError = new OneInchApiError(
        path,
        0,
        '',
        `network error — ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      if (attempt === MAX_RETRIES) throw lastError;
      await delay(BASE_BACKOFF_MS * 2 ** attempt);
      continue;
    }

    if (response.ok) {
      const text = await response.text();
      try {
        return JSON.parse(text) as T;
      } catch (cause) {
        throw new OneInchApiError(
          path,
          response.status,
          text,
          `response was not valid JSON — ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    }

    const body = await response.text();
    let description: string | undefined;
    try {
      const parsed = JSON.parse(body) as OneInchErrorBody;
      description = parsed.description ?? parsed.error;
    } catch {
      // Body was not JSON; the raw text is already attached to the error.
      description = undefined;
    }

    const retriable = response.status === 429 || response.status >= 500;
    lastError = new OneInchApiError(path, response.status, body, description);

    if (!retriable || attempt === MAX_RETRIES) throw lastError;

    const retryAfterHeader = response.headers.get('retry-after');
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : Number.NaN;
    const backoff = Number.isFinite(retryAfterMs)
      ? Math.min(retryAfterMs, 10_000)
      : BASE_BACKOFF_MS * 2 ** attempt;
    await delay(backoff);
  }

  /* istanbul ignore next — loop always returns or throws; this satisfies the compiler. */
  throw lastError ?? new OneInchApiError(path, 0, '', 'exhausted retries with no response');
}

/**
 * Fetch an indicative swap quote (no transaction is built).
 *
 * @param p.chainId - One of {@link SUPPORTED_CHAINS}.
 * @param p.src - Source token address (use {@link NATIVE_TOKEN_ADDRESS} for the native coin).
 * @param p.dst - Destination token address.
 * @param p.amount - Source amount in base units (wei-style string).
 * @returns A normalized {@link SwapQuote}.
 * @throws {OneInchApiError} On unsupported chains or a non-OK 1inch response.
 * @throws {MissingEnvError} When `ONEINCH_API_KEY` is unset.
 */
export async function getQuote(p: {
  chainId: number;
  src: string;
  dst: string;
  amount: string;
}): Promise<SwapQuote> {
  assertSupportedChain(p.chainId);

  const raw = await oneInchGet<RawQuoteResponse>(`/swap/${SWAP_API_VERSION}/${p.chainId}/quote`, {
    src: p.src,
    dst: p.dst,
    amount: p.amount,
    includeGas: 'true',
    includeProtocols: 'true',
  });

  return {
    srcToken: p.src,
    dstToken: p.dst,
    srcAmount: p.amount,
    dstAmount: raw.dstAmount ?? '0',
    estimatedGas: raw.gas !== undefined ? String(raw.gas) : '0',
    protocols: raw.protocols ?? [],
  };
}

/**
 * Build an executable swap transaction for the Aetheris treasury to sign/send.
 *
 * @param p.chainId - One of {@link SUPPORTED_CHAINS}.
 * @param p.src - Source token address.
 * @param p.dst - Destination token address.
 * @param p.amount - Source amount in base units.
 * @param p.from - Wallet performing the swap (must hold the funds and allowance).
 * @param p.slippage - Slippage tolerance in percent (default 1, clamped to 0–50).
 * @returns Transaction fields ready for `sendTransaction`.
 * @throws {OneInchApiError} On unsupported chains, insufficient allowance/liquidity, etc.
 * @throws {MissingEnvError} When `ONEINCH_API_KEY` is unset.
 */
export async function buildSwapTx(p: {
  chainId: number;
  src: string;
  dst: string;
  amount: string;
  from: string;
  slippage?: number;
}): Promise<{ to: string; data: string; value: string; gas?: string }> {
  assertSupportedChain(p.chainId);

  const requested = p.slippage ?? 1;
  const slippage = Number.isFinite(requested) ? Math.min(Math.max(requested, 0), 50) : 1;

  const raw = await oneInchGet<RawSwapResponse>(`/swap/${SWAP_API_VERSION}/${p.chainId}/swap`, {
    src: p.src,
    dst: p.dst,
    amount: p.amount,
    from: p.from,
    // v6.0 requires `origin` — the EOA that initiated the swap. For Aetheris the
    // treasury signer is both the holder and the originator.
    origin: p.from,
    slippage: String(slippage),
    includeProtocols: 'true',
  });

  const tx = raw.tx;
  if (!tx?.to || !tx.data) {
    throw new OneInchApiError(
      `/swap/${SWAP_API_VERSION}/${p.chainId}/swap`,
      502,
      JSON.stringify(raw).slice(0, 400),
      'response did not contain a usable `tx.to` / `tx.data`',
    );
  }

  return {
    to: tx.to,
    data: tx.data,
    value: tx.value ?? '0',
    gas: tx.gas !== undefined ? String(tx.gas) : undefined,
  };
}

/**
 * Fetch every non-zero-tracked token balance for a wallet on one chain,
 * via the 1inch Balance API.
 *
 * @param chainId - One of {@link SUPPORTED_CHAINS}.
 * @param wallet - Wallet address to inspect.
 * @returns Map of `tokenAddress -> balance` in base units. Zero balances are stripped.
 * @throws {OneInchApiError} On unsupported chains or a non-OK 1inch response.
 * @throws {MissingEnvError} When `ONEINCH_API_KEY` is unset.
 */
export async function getTokenBalances(
  chainId: number,
  wallet: string,
): Promise<Record<string, string>> {
  assertSupportedChain(chainId);

  const raw = await oneInchGet<Record<string, string>>(
    `/balance/${BALANCE_API_VERSION}/${chainId}/balances/${wallet}`,
    {},
  );

  const balances: Record<string, string> = {};
  for (const [token, amount] of Object.entries(raw ?? {})) {
    if (typeof amount === 'string' && amount !== '0') balances[token.toLowerCase()] = amount;
  }
  return balances;
}

/**
 * Look up the display name for a supported chain id.
 *
 * @param chainId - EVM chain id.
 * @returns The chain's name, or `Chain {id}` when unknown.
 */
export function chainName(chainId: number): string {
  return SUPPORTED_CHAINS.find((c) => c.id === chainId)?.name ?? `Chain ${chainId}`;
}
