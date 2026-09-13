/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SERVER-ONLY MODULE — on-chain World ID operator registry reads.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Reads the three `AetherisAgency` views that decide what the UI may honestly
 * claim about the operator's World ID status:
 *
 *   - `isVerifiedOperator(operator)`        — did `verifyOperator` run for this address?
 *   - `operatorNullifier(operator)`         — the nullifier hash it burned (0 = none)
 *   - `worldIdVerificationBypassed()`       — true when the contract has NO World ID
 *                                             router, i.e. the Groth16 proof was never
 *                                             checked on-chain (Hedera testnet today).
 *
 * hashio rejects batched JSON-RPC, so the provider is created with `batchMaxCount: 1`.
 */

import { Contract, JsonRpcProvider, Network } from 'ethers';

import { assertServerOnly } from './env';
import { HEDERA_TESTNET_CHAIN_ID, HEDERA_TESTNET_RPC } from './hedera';

const REGISTRY_ABI = [
  'function isVerifiedOperator(address) view returns (bool)',
  'function operatorNullifier(address) view returns (uint256)',
  'function worldIdVerificationBypassed() view returns (bool)',
] as const;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export interface OperatorRegistrySnapshot {
  agency: string;
  operator: string;
  /** `isVerifiedOperator(operator)`. */
  isVerified: boolean;
  /** `operatorNullifier(operator)` as a decimal string; `null` when zero. */
  nullifierHash: string | null;
  /** `worldIdVerificationBypassed()` — true: no router, ZK check skipped on-chain. */
  worldIdBypassed: boolean;
  /** JSON-RPC endpoint the snapshot was read from. */
  rpcUrl: string;
}

/**
 * Read the operator's World ID registry state straight from Hedera JSON-RPC.
 *
 * @throws If either address is malformed or any of the three `eth_call`s fails —
 *         callers keep their previous (subgraph) value and surface the reason.
 */
export async function readOperatorRegistry(
  agency: string,
  operator: string,
): Promise<OperatorRegistrySnapshot> {
  assertServerOnly('lib/operator-registry.ts#readOperatorRegistry');
  if (!ADDRESS_RE.test(agency)) throw new Error(`Agency address is malformed: ${agency}`);
  if (!ADDRESS_RE.test(operator)) throw new Error(`Operator address is malformed: ${operator}`);

  const rpcUrl = (process.env.HEDERA_TESTNET_RPC ?? '').trim() || HEDERA_TESTNET_RPC;
  const provider = new JsonRpcProvider(
    rpcUrl,
    new Network('hedera-testnet', HEDERA_TESTNET_CHAIN_ID),
    { staticNetwork: true, batchMaxCount: 1 },
  );
  const registry = new Contract(agency, REGISTRY_ABI, provider);

  try {
    const isVerified = (await registry.isVerifiedOperator(operator)) as boolean;
    const nullifier = (await registry.operatorNullifier(operator)) as bigint;
    const worldIdBypassed = (await registry.worldIdVerificationBypassed()) as boolean;
    return {
      agency,
      operator,
      isVerified,
      nullifierHash: nullifier === 0n ? null : nullifier.toString(10),
      worldIdBypassed,
      rpcUrl,
    };
  } finally {
    provider.destroy();
  }
}
