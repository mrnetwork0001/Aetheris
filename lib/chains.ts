import { defineChain, type Chain } from 'viem';
import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains';

/**
 * Hedera Testnet as an EVM chain (JSON-RPC relay). Aetheris settles here:
 * `AetherisTreasury.sol` and `AetherisAgency.sol` are deployed on Hedera EVM.
 */
export const hederaTestnet: Chain = defineChain({
  id: 296,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet.hashio.io/api'] },
  },
  blockExplorers: {
    default: { name: 'HashScan', url: 'https://hashscan.io/testnet' },
  },
  testnet: true,
});

/**
 * Chains the Aetheris UI is allowed to operate on.
 * Hedera is the settlement chain; the EVM L1/L2s are 1inch rebalancing venues.
 */
export const aetherisChains: readonly Chain[] = [
  hederaTestnet,
  mainnet,
  arbitrum,
  base,
  optimism,
  polygon,
] as const;

export { arbitrum, base, mainnet, optimism, polygon };
