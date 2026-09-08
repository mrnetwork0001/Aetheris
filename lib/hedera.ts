/**
 * Hedera integration for Aetheris.
 *
 *  • `submitHcsMessage` — **server-only**. Writes an immutable audit entry to a
 *    Hedera Consensus Service topic using operator credentials from the env.
 *    The `@hashgraph/sdk` import is *dynamic* so this module stays import-safe in
 *    client bundles (the UI needs `HEDERA_TESTNET_CHAIN_ID`).
 *
 *  • `readHcsMessages` — reads via the Hedera **mirror node REST API**. We do NOT
 *    open a `TopicMessageQuery` gRPC subscription from a request handler: that is a
 *    long-lived stream and would leak connections in a serverless/Next.js runtime.
 */

import { assertServerOnly, optionalEnv, requireEnv } from './env';

/** Hedera Testnet EVM chain id — the chain AetherisTreasury.sol is deployed to. */
export const HEDERA_TESTNET_CHAIN_ID = 296 as const;

/** Default JSON-RPC relay for Hedera Testnet EVM calls. */
export const HEDERA_TESTNET_RPC = 'https://testnet.hashio.io/api';

/** Default mirror node REST origin for Hedera Testnet. */
export const HEDERA_MIRROR_NODE_BASE = 'https://testnet.mirrornode.hedera.com';

/** Error raised for any Hedera SDK or mirror-node failure. */
export class HederaError extends Error {
  readonly name = 'HederaError';
  readonly operation: string;

  constructor(operation: string, message: string) {
    super(`Hedera ${operation} failed: ${message}`);
    this.operation = operation;
  }
}

/** A single HCS message as surfaced to the Aetheris UI / subgraph anchor view. */
export type HcsMessage = {
  sequenceNumber: string;
  contents: string;
  consensusTimestamp: string;
};

/** Raw mirror-node message record (only the fields we consume are modelled). */
type MirrorNodeMessage = {
  consensus_timestamp?: string;
  message?: string;
  sequence_number?: number | string;
  topic_id?: string;
};

/** Raw mirror-node `/topics/{id}/messages` envelope. */
type MirrorNodeMessagesResponse = {
  messages?: MirrorNodeMessage[];
  _status?: { messages?: { message?: string }[] };
};

/**
 * Decode a base64 payload in either a Node or browser runtime.
 *
 * @param b64 - Base64 string from the mirror node.
 * @returns The decoded UTF-8 string, or `''` when decoding fails.
 */
function decodeBase64(b64: string): string {
  try {
    if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
    if (typeof atob === 'function') {
      const binary = atob(b64);
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return '';
  } catch {
    // A non-UTF-8 / malformed payload must not break the audit-log render.
    return '';
  }
}

/**
 * Parse a Hedera operator key, tolerating DER, ECDSA-hex and ED25519-hex forms.
 *
 * @param sdk - The dynamically imported `@hashgraph/sdk` module namespace.
 * @param raw - Raw key string from `HEDERA_OPERATOR_KEY`.
 * @returns A `PrivateKey` instance.
 * @throws {HederaError} When no supported encoding matches.
 */
function parseOperatorKey(
  sdk: typeof import('@hashgraph/sdk'),
  raw: string,
): import('@hashgraph/sdk').PrivateKey {
  const parsers = [
    () => sdk.PrivateKey.fromStringDer(raw),
    () => sdk.PrivateKey.fromStringECDSA(raw),
    () => sdk.PrivateKey.fromStringED25519(raw),
  ];
  for (const parse of parsers) {
    try {
      return parse();
    } catch {
      // Try the next encoding; the aggregate failure is reported below.
      continue;
    }
  }
  throw new HederaError(
    'operator key parsing',
    'HEDERA_OPERATOR_KEY is not a valid DER, ECDSA, or ED25519 private key string.',
  );
}

/**
 * Publish an immutable message to a Hedera Consensus Service topic. **Server-only.**
 *
 * Aetheris uses this to anchor job milestones and sub-agent settlements so that the
 * agency's execution stream is independently auditable and indexable by The Graph.
 *
 * @param topicId - HCS topic id (e.g. `0.0.123456`).
 * @param message - UTF-8 payload (typically a JSON audit record).
 * @returns The topic id, assigned consensus sequence number, and transaction id.
 * @throws {ServerOnlyViolationError} If called from the browser.
 * @throws {MissingEnvError} When `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_KEY` are unset.
 * @throws {HederaError} On submission or receipt failure.
 */
export async function submitHcsMessage(
  topicId: string,
  message: string,
): Promise<{ topicId: string; sequenceNumber: string; transactionId: string }> {
  assertServerOnly('lib/hedera.ts#submitHcsMessage');

  const resolvedTopicId = (topicId ?? '').trim() || optionalEnv('HEDERA_HCS_TOPIC_ID');
  if (!resolvedTopicId) {
    throw new HederaError(
      'HCS submit',
      'No topic id supplied and HEDERA_HCS_TOPIC_ID is not set.',
    );
  }
  if (typeof message !== 'string' || message.length === 0) {
    throw new HederaError('HCS submit', 'Message must be a non-empty string.');
  }

  const operatorId = requireEnv('HEDERA_OPERATOR_ID', 'Format: 0.0.xxxxxxx');
  const operatorKey = requireEnv('HEDERA_OPERATOR_KEY');

  // Dynamic import keeps @hashgraph/sdk (a large, Node-oriented package) out of any
  // client bundle that merely imports HEDERA_TESTNET_CHAIN_ID from this module.
  const sdk = await import('@hashgraph/sdk');
  const network = optionalEnv('HEDERA_NETWORK', 'testnet').toLowerCase();
  const client = network === 'mainnet' ? sdk.Client.forMainnet() : sdk.Client.forTestnet();

  try {
    client.setOperator(sdk.AccountId.fromString(operatorId), parseOperatorKey(sdk, operatorKey));

    const response = await new sdk.TopicMessageSubmitTransaction()
      .setTopicId(sdk.TopicId.fromString(resolvedTopicId))
      .setMessage(message)
      .execute(client);

    const receipt = await response.getReceipt(client);
    const sequenceNumber = receipt.topicSequenceNumber;

    return {
      topicId: resolvedTopicId,
      sequenceNumber: sequenceNumber ? sequenceNumber.toString() : '0',
      transactionId: response.transactionId.toString(),
    };
  } catch (cause) {
    if (cause instanceof HederaError) throw cause;
    throw new HederaError(
      'HCS submit',
      cause instanceof Error ? cause.message : String(cause),
    );
  } finally {
    try {
      client.close();
    } catch {
      // Closing a already-torn-down client is not actionable; the submit result stands.
    }
  }
}

/**
 * Read recent messages from an HCS topic via the mirror node REST API.
 * Safe to call from the server or the browser (no credentials required).
 *
 * @param topicId - HCS topic id (e.g. `0.0.123456`). Falls back to `HEDERA_HCS_TOPIC_ID`.
 * @param limit - Maximum messages to return, 1–100 (default 25). Newest first.
 * @returns Decoded messages ordered newest-first.
 * @throws {HederaError} When no topic id is available or the mirror node errors.
 */
export async function readHcsMessages(
  topicId: string,
  limit = 25,
): Promise<{ sequenceNumber: string; contents: string; consensusTimestamp: string }[]> {
  const resolvedTopicId = (topicId ?? '').trim() || optionalEnv('HEDERA_HCS_TOPIC_ID');
  if (!resolvedTopicId) {
    throw new HederaError(
      'mirror node read',
      'No topic id supplied and HEDERA_HCS_TOPIC_ID is not set.',
    );
  }

  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 100) : 25;
  const base = optionalEnv('HEDERA_MIRROR_NODE_URL', HEDERA_MIRROR_NODE_BASE).replace(/\/+$/, '');
  const url =
    `${base}/api/v1/topics/${encodeURIComponent(resolvedTopicId)}/messages` +
    `?limit=${safeLimit}&order=desc`;

  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  } catch (cause) {
    throw new HederaError(
      'mirror node read',
      `could not reach ${url} — ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const text = await response.text();

  if (!response.ok) {
    // A topic with no messages yet legitimately 404s — treat that as "empty".
    if (response.status === 404) return [];
    throw new HederaError('mirror node read', `HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  let payload: MirrorNodeMessagesResponse;
  try {
    payload = JSON.parse(text) as MirrorNodeMessagesResponse;
  } catch (cause) {
    throw new HederaError(
      'mirror node read',
      `response was not valid JSON — ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  return (payload.messages ?? []).map((m) => ({
    sequenceNumber: m.sequence_number !== undefined ? String(m.sequence_number) : '0',
    contents: m.message ? decodeBase64(m.message) : '',
    consensusTimestamp: m.consensus_timestamp ?? '',
  }));
}

/**
 * Build a HashScan explorer URL for an HCS topic or transaction.
 *
 * @param kind - `'topic'` or `'transaction'`.
 * @param id - Topic id or transaction id.
 * @returns The HashScan URL for the configured network.
 */
export function hashscanUrl(kind: 'topic' | 'transaction', id: string): string {
  const network = optionalEnv('HEDERA_NETWORK', 'testnet').toLowerCase();
  return `https://hashscan.io/${network}/${kind}/${encodeURIComponent(id)}`;
}
