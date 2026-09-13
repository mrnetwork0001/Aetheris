/**
 * Aetheris treasury — live on-chain holdings for `AetherisTreasury.sol`.
 *
 * **Server-only.** Reads ERC-20 / HTS-facade balances over the Hedera JSON-RPC
 * relay and prices them honestly:
 *   • test stablecoins (symbol contains "USD") are valued 1:1 with their human amount;
 *   • HBAR is priced from CoinGecko (no key, 5-minute in-memory cache); if the
 *     price feed fails the usdValue is 0 and the reason is surfaced to the caller.
 *
 * There is no allocation policy on-chain, so `targetWeight` mirrors the actual
 * weight (drift reads 0) rather than inventing a target.
 *
 * Hashio rejects `eth_getLogs` inside JSON-RPC batches, so the provider is built
 * with `batchMaxCount: 1` — every call goes out as its own request.
 */

import { ethers } from 'ethers';
import type { TreasuryHolding } from '@/components/aetheris-data';
import { assertServerOnly, optionalEnv } from './env';
import { HEDERA_TESTNET_CHAIN_ID, HEDERA_TESTNET_RPC } from './hedera';
import { getTreasuryTokens } from './subgraph';

/** Human-readable chain name attached to every holding. */
export const HEDERA_TESTNET_CHAIN_NAME = 'Hedera Testnet';

/** Synthetic address used for the native HBAR row. */
export const NATIVE_HBAR_ADDRESS = '0x0000000000000000000000000000000000000000';

/** CoinGecko simple-price endpoint for HBAR. */
const HBAR_PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=usd';

const PRICE_TTL_MS = 5 * 60 * 1000;
const HOLDINGS_TTL_MS = 30 * 1000;

const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
] as const;

/** Result of a treasury read: holdings plus any non-fatal caveats. */
export interface TreasuryReadResult {
  holdings: TreasuryHolding[];
  /** Sum of `usdValue` across holdings. */
  totalUsd: number;
  /** Non-fatal problems (e.g. the price feed was unreachable, a token reverted). */
  warnings: string[];
}

let provider: ethers.JsonRpcProvider | null = null;

/** Lazily construct the Hedera relay provider (batching disabled, see header). */
export function getTreasuryProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    const url = optionalEnv('HEDERA_TESTNET_RPC', HEDERA_TESTNET_RPC);
    provider = new ethers.JsonRpcProvider(
      url,
      { chainId: HEDERA_TESTNET_CHAIN_ID, name: 'hedera-testnet' },
      { batchMaxCount: 1, staticNetwork: true },
    );
  }
  return provider;
}

/* ───────────────────────────── HBAR price (cached) ───────────────────────────── */

let priceCache: { usd: number; fetchedAt: number } | null = null;

/**
 * HBAR/USD spot from CoinGecko with a 5-minute in-memory cache.
 *
 * @returns `{ usd }` on success, or `{ usd: null, error }` with the reason on failure.
 */
export async function getHbarUsdPrice(): Promise<{ usd: number | null; error?: string }> {
  if (priceCache && Date.now() - priceCache.fetchedAt < PRICE_TTL_MS) {
    return { usd: priceCache.usd };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    let res: Response;
    try {
      res = await fetch(HBAR_PRICE_URL, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const reason = `CoinGecko HBAR price feed returned HTTP ${res.status}.`;
      return priceCache ? { usd: priceCache.usd, error: reason } : { usd: null, error: reason };
    }
    const body: unknown = await res.json();
    const usd =
      typeof body === 'object' && body !== null
        ? (body as { 'hedera-hashgraph'?: { usd?: unknown } })['hedera-hashgraph']?.usd
        : undefined;
    if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) {
      const reason = 'CoinGecko HBAR price feed returned no usable price.';
      return priceCache ? { usd: priceCache.usd, error: reason } : { usd: null, error: reason };
    }
    priceCache = { usd, fetchedAt: Date.now() };
    return { usd };
  } catch (cause) {
    const reason = `CoinGecko HBAR price feed unreachable: ${
      cause instanceof Error ? cause.message : String(cause)
    }`;
    // Serve a stale price (if we ever had one) rather than nothing, but say so.
    return priceCache ? { usd: priceCache.usd, error: reason } : { usd: null, error: reason };
  }
}

/* ───────────────────────────── Holdings (cached) ───────────────────────────── */

let holdingsCache: { key: string; result: TreasuryReadResult; fetchedAt: number } | null = null;

function describe(cause: unknown): string {
  if (cause instanceof Error) {
    const short = (cause as { shortMessage?: unknown }).shortMessage;
    return typeof short === 'string' && short.length > 0 ? short : cause.message;
  }
  return String(cause);
}

/** Convert a base-unit bigint to a JS number of whole tokens (precision-safe enough for display). */
function toHuman(amount: bigint, decimals: number): number {
  return Number(ethers.formatUnits(amount, decimals));
}

function isStablecoin(symbol: string): boolean {
  return symbol.toUpperCase().includes('USD');
}

/**
 * Read every token the treasury has been funded in (per the subgraph) plus native
 * HBAR, and value them. Whole result cached 30s in memory per treasury address.
 *
 * @param treasury - `AetherisTreasury` EVM address.
 * @returns Holdings, their USD total and any non-fatal warnings.
 * @throws When the RPC itself is unreachable (the caller falls back to demo data).
 */
export async function readTreasury(treasury: string): Promise<TreasuryReadResult> {
  assertServerOnly('lib/treasury');
  const key = treasury.toLowerCase();
  if (holdingsCache && holdingsCache.key === key && Date.now() - holdingsCache.fetchedAt < HOLDINGS_TTL_MS) {
    return holdingsCache.result;
  }
  if (!ethers.isAddress(treasury)) {
    throw new Error(`Treasury address "${treasury}" is not a valid EVM address.`);
  }

  const rpc = getTreasuryProvider();
  const warnings: string[] = [];

  // Token discovery degrades to [] on subgraph trouble — we still report HBAR.
  const tokens = await getTreasuryTokens();
  if (tokens.length === 0) {
    warnings.push('Subgraph returned no funded tokens; showing native HBAR only.');
  }

  const [hbarWei, price] = await Promise.all([rpc.getBalance(treasury), getHbarUsdPrice()]);
  if (price.error) warnings.push(price.error);

  const holdings: TreasuryHolding[] = [];

  for (const address of tokens) {
    const contract = new ethers.Contract(address, ERC20_ABI, rpc);
    try {
      const [symbolRaw, decimalsRaw, balanceRaw] = await Promise.all([
        contract.symbol() as Promise<string>,
        contract.decimals() as Promise<bigint | number>,
        contract.balanceOf(treasury) as Promise<bigint>,
      ]);
      let name = symbolRaw;
      try {
        name = (await contract.name()) as string;
      } catch {
        /* name() is optional in ERC-20; fall back to the symbol. */
      }
      const decimals = Number(decimalsRaw);
      const amount = BigInt(balanceRaw);
      const human = toHuman(amount, decimals);
      holdings.push({
        symbol: symbolRaw,
        name,
        address,
        chainId: HEDERA_TESTNET_CHAIN_ID,
        chainName: HEDERA_TESTNET_CHAIN_NAME,
        decimals,
        amountRaw: amount.toString(),
        // Test stablecoins are the only tokens with a defensible price: 1:1.
        usdValue: isStablecoin(symbolRaw) ? human : 0,
        targetWeight: 0, // filled in below once the total is known
      });
      if (!isStablecoin(symbolRaw)) {
        warnings.push(`${symbolRaw} (${address}) has no price source; valued at $0.`);
      }
    } catch (cause) {
      const reason = `Token ${address} skipped — ERC-20 call reverted: ${describe(cause)}`;
      console.warn(`[aetheris:treasury] ${reason}`);
      warnings.push(reason);
    }
  }

  const hbarHuman = toHuman(hbarWei, 18);
  holdings.push({
    symbol: 'HBAR',
    name: 'Hedera',
    address: NATIVE_HBAR_ADDRESS,
    chainId: HEDERA_TESTNET_CHAIN_ID,
    chainName: HEDERA_TESTNET_CHAIN_NAME,
    decimals: 18,
    amountRaw: hbarWei.toString(),
    usdValue: price.usd === null ? 0 : hbarHuman * price.usd,
    targetWeight: 0,
  });

  const totalUsd = holdings.reduce((sum, h) => sum + h.usdValue, 0);
  // No on-chain allocation policy exists: target == actual, so drift is 0.
  for (const h of holdings) {
    h.targetWeight = totalUsd > 0 ? h.usdValue / totalUsd : 0;
  }

  const result: TreasuryReadResult = { holdings, totalUsd, warnings };
  holdingsCache = { key, result, fetchedAt: Date.now() };
  return result;
}

/* ───────────────────────────── Token metadata (cached) ───────────────────────────── */

/** `symbol()` / `decimals()` of an ERC-20 or HTS-facade token. */
export interface TokenMetadata {
  /** Lowercase EVM address. */
  address: string;
  symbol: string;
  decimals: number;
}

const tokenMetaCache = new Map<string, TokenMetadata>();

/**
 * Read a token's `symbol()` and `decimals()` over the Hedera relay. Token metadata
 * is immutable, so successful reads are memoised for the process lifetime. The
 * subgraph's `Token` entity carries neither field, so this is the only honest
 * source for labelling settlement amounts.
 *
 * @param address - Token EVM address (ERC-20 or HTS facade).
 * @returns The token's symbol and decimals.
 * @throws When the address is invalid, either call reverts, or the RPC is unreachable.
 */
export async function readTokenMetadata(address: string): Promise<TokenMetadata> {
  assertServerOnly('lib/treasury');
  const key = address.trim().toLowerCase();
  const hit = tokenMetaCache.get(key);
  if (hit) return hit;
  if (!ethers.isAddress(key)) {
    throw new Error(`Token address "${address}" is not a valid EVM address.`);
  }
  const contract = new ethers.Contract(key, ERC20_ABI, getTreasuryProvider());
  const [symbolRaw, decimalsRaw] = await Promise.all([
    contract.symbol() as Promise<string>,
    contract.decimals() as Promise<bigint | number>,
  ]);
  const meta: TokenMetadata = { address: key, symbol: String(symbolRaw), decimals: Number(decimalsRaw) };
  tokenMetaCache.set(key, meta);
  return meta;
}

/**
 * Convenience wrapper returning only the holdings array.
 *
 * @param treasury - `AetherisTreasury` EVM address.
 * @returns Live holdings (ERC-20/HTS tokens from the subgraph + native HBAR).
 */
export async function readTreasuryHoldings(treasury: string): Promise<TreasuryHolding[]> {
  return (await readTreasury(treasury)).holdings;
}

/**
 * Total USD value of the treasury expressed in 6-decimal base units (the unit
 * `AgencyStats.treasuryRaw` uses).
 *
 * @param treasury - `AetherisTreasury` EVM address.
 * @returns Integer string of micro-dollars.
 */
export async function readTreasuryTotalUsdRaw(treasury: string): Promise<string> {
  const { totalUsd } = await readTreasury(treasury);
  return Math.round(totalUsd * 1_000_000).toString();
}
