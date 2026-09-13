/**
 * Client-side write path for Aetheris on Hedera testnet (chain 296).
 *
 * Signs with whatever EIP-1193 provider the connected wallet exposes (Privy
 * embedded wallet or an external wallet), reads through Hashio. Every helper
 * returns transaction hashes and waits for the receipt, so callers can show
 * real HashScan links - nothing here fakes a transaction.
 */
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";

import { hederaTestnet } from "@/lib/chains";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export const HASHSCAN_TX = "https://hashscan.io/testnet/transaction/";

const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

const AGENCY_ABI = [
  { type: "function", name: "createJob", stateMutability: "nonpayable", inputs: [{ name: "token", type: "address" }, { name: "deposit", type: "uint256" }, { name: "specURI", type: "string" }], outputs: [{ name: "jobId", type: "uint256" }] },
  { type: "function", name: "refundJob", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "uint256" }], outputs: [{ name: "refunded", type: "uint256" }] },
] as const;

export function publicClient() {
  return createPublicClient({ chain: hederaTestnet, transport: http(hederaTestnet.rpcUrls.default.http[0]) });
}

function walletClient(provider: Eip1193Provider, account: Address) {
  return createWalletClient({ chain: hederaTestnet, account, transport: custom(provider) });
}

/** Ask the wallet to switch to Hedera testnet, adding the chain if it is unknown. */
export async function ensureHederaChain(provider: Eip1193Provider): Promise<void> {
  const hexId = `0x${hederaTestnet.id.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) return; // already there, or the wallet handles chains itself
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexId,
          chainName: hederaTestnet.name,
          nativeCurrency: hederaTestnet.nativeCurrency,
          rpcUrls: [...hederaTestnet.rpcUrls.default.http],
          blockExplorerUrls: ["https://hashscan.io/testnet"],
        },
      ],
    });
  }
}

export interface TokenBalance {
  raw: bigint;
  decimals: number;
  symbol: string;
}

export async function readTokenBalance(token: string, owner: string): Promise<TokenBalance> {
  const client = publicClient();
  const t = getAddress(token);
  const o = getAddress(owner);
  const [raw, decimals, symbol] = await Promise.all([
    client.readContract({ address: t, abi: ERC20_ABI, functionName: "balanceOf", args: [o] }),
    client.readContract({ address: t, abi: ERC20_ABI, functionName: "decimals" }),
    client.readContract({ address: t, abi: ERC20_ABI, functionName: "symbol" }),
  ]);
  return { raw, decimals: Number(decimals), symbol };
}

export async function readHbarBalance(owner: string): Promise<bigint> {
  return publicClient().getBalance({ address: getAddress(owner) });
}

export type WriteStep = "approve" | "createJob" | "refund";

export interface StepEvent {
  step: WriteStep;
  status: "signing" | "pending" | "mined";
  hash?: Hex;
}

export interface CreateJobParams {
  provider: Eip1193Provider;
  account: string;
  agency: string;
  token: string;
  /** Deposit in base units. */
  amountRaw: bigint;
  specURI: string;
  onStep?: (event: StepEvent) => void;
}

/**
 * approve(agency, amount) - skipped when the allowance already covers it -
 * then createJob(token, amount, specURI). The client must approve the AGENCY
 * (not the treasury): the agency pulls the deposit into the treasury itself.
 */
export async function approveAndCreateJob(p: CreateJobParams): Promise<{ approveHash: Hex | null; createHash: Hex }> {
  const account = getAddress(p.account);
  const agency = getAddress(p.agency);
  const token = getAddress(p.token);
  const pub = publicClient();
  const wallet = walletClient(p.provider, account);

  let approveHash: Hex | null = null;
  const allowance = await pub.readContract({ address: token, abi: ERC20_ABI, functionName: "allowance", args: [account, agency] });
  if (allowance < p.amountRaw) {
    p.onStep?.({ step: "approve", status: "signing" });
    approveHash = await wallet.writeContract({ address: token, abi: ERC20_ABI, functionName: "approve", args: [agency, p.amountRaw] });
    p.onStep?.({ step: "approve", status: "pending", hash: approveHash });
    await pub.waitForTransactionReceipt({ hash: approveHash });
    p.onStep?.({ step: "approve", status: "mined", hash: approveHash });
  }

  p.onStep?.({ step: "createJob", status: "signing" });
  const createHash = await wallet.writeContract({
    address: agency,
    abi: AGENCY_ABI,
    functionName: "createJob",
    args: [token, p.amountRaw, p.specURI],
    gas: 1_000_000n, // HTS tokens route through the precompile; plain ERC-20s need far less
  });
  p.onStep?.({ step: "createJob", status: "pending", hash: createHash });
  const receipt = await pub.waitForTransactionReceipt({ hash: createHash });
  if (receipt.status !== "success") throw new Error(`createJob reverted (${createHash})`);
  p.onStep?.({ step: "createJob", status: "mined", hash: createHash });
  return { approveHash, createHash };
}

export async function refundJob(p: { provider: Eip1193Provider; account: string; agency: string; jobId: string; onStep?: (e: StepEvent) => void }): Promise<Hex> {
  const account = getAddress(p.account);
  const pub = publicClient();
  const wallet = walletClient(p.provider, account);
  p.onStep?.({ step: "refund", status: "signing" });
  const hash = await wallet.writeContract({ address: getAddress(p.agency), abi: AGENCY_ABI, functionName: "refundJob", args: [BigInt(p.jobId)], gas: 1_000_000n });
  p.onStep?.({ step: "refund", status: "pending", hash });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`refundJob reverted (${hash})`);
  p.onStep?.({ step: "refund", status: "mined", hash });
  return hash;
}

export function explainWriteError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/user rejected|denied|rejected the request/i.test(message)) return "You rejected the signature.";
  if (/insufficient funds|insufficient balance/i.test(message)) return "Not enough HBAR for gas - use the testnet faucet below.";
  if (/FeeExceedsDeposit|ZeroAmount|InvalidJobStatus|NotClientOrOperator/i.test(message)) {
    const m = message.match(/(FeeExceedsDeposit|ZeroAmount|InvalidJobStatus|NotClientOrOperator)/i);
    return `Contract refused: ${m?.[1] ?? "custom error"}.`;
  }
  return message.length > 220 ? `${message.slice(0, 220)}…` : message;
}
