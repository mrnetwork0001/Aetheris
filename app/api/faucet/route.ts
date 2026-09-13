import { NextResponse } from "next/server";
import { Contract, JsonRpcProvider, Network, Wallet, isAddress, parseEther, parseUnits } from "ethers";

import { badRequest, describeError, readJsonObject, upstreamFailure } from "../_lib/http";

/**
 * POST /api/faucet - Hedera TESTNET only.
 *
 * Funds a freshly created wallet so the Client flow can be exercised end to
 * end: 1 HBAR for gas (only if the wallet holds < 0.5) and 10 test aUSDC minted
 * from the open `MockERC20.mint`. Signs with the deployer key; rate-limited so
 * it cannot drain the account. Refuses on any chain other than 296.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAIN_ID = 296;
const RPC = process.env.HEDERA_TESTNET_RPC ?? "https://testnet.hashio.io/api";
const TEST_TOKEN = process.env.NEXT_PUBLIC_AETHERIS_TEST_TOKEN ?? "0x21DCc52AbbCAef92B4573dc8B0e1658417c85961";
const HBAR_TOPUP = parseEther("1");
const HBAR_FLOOR = parseEther("0.5");
const TOKEN_AMOUNT = "10";

const ERC20 = ["function mint(address to, uint256 amount) external", "function decimals() view returns (uint8)", "function symbol() view returns (string)"];

/* in-memory limits: 3 drips per address per hour, 30 per hour overall */
const perAddress = new Map<string, number[]>();
const global: number[] = [];
const HOUR = 60 * 60 * 1000;

function limited(address: string): boolean {
  const now = Date.now();
  const mine = (perAddress.get(address) ?? []).filter((t) => now - t < HOUR);
  const all = global.filter((t) => now - t < HOUR);
  global.length = 0;
  global.push(...all);
  if (mine.length >= 3 || all.length >= 30) return true;
  mine.push(now);
  perAddress.set(address, mine);
  global.push(now);
  return false;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJsonObject(request);
  if (!body.ok) return body.response;
  const to = typeof body.value.address === "string" ? body.value.address.trim() : "";
  if (!isAddress(to)) return badRequest("`address` must be a 0x-prefixed 20-byte EVM address.");

  const raw = (process.env.PRIVATE_KEY ?? "").trim();
  if (raw === "") {
    return NextResponse.json({ error: { code: "FAUCET_NOT_CONFIGURED", message: "PRIVATE_KEY is not set on this server." } }, { status: 503 });
  }
  if (limited(to.toLowerCase())) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Faucet limit reached: 3 drips per address per hour." } }, { status: 429 });
  }

  try {
    const provider = new JsonRpcProvider(RPC, new Network("hedera-testnet", CHAIN_ID), { staticNetwork: true, batchMaxCount: 1 });
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== CHAIN_ID) {
      return NextResponse.json({ error: { code: "WRONG_CHAIN", message: `Faucet only serves Hedera testnet (296); RPC reports ${net.chainId}.` } }, { status: 503 });
    }
    const signer = new Wallet(raw.startsWith("0x") ? raw : `0x${raw}`, provider);
    const token = new Contract(TEST_TOKEN, ERC20, signer);
    const [decimals, symbol, balance] = await Promise.all([token.decimals() as Promise<bigint>, token.symbol() as Promise<string>, provider.getBalance(to)]);

    let hbarTx: string | null = null;
    if (balance < HBAR_FLOOR) {
      const tx = await signer.sendTransaction({ to, value: HBAR_TOPUP });
      await tx.wait(1);
      hbarTx = tx.hash;
    }
    const mint = await token.mint(to, parseUnits(TOKEN_AMOUNT, Number(decimals)), { gasLimit: 300_000 });
    await mint.wait(1);

    return NextResponse.json({
      ok: true,
      to,
      hbar: hbarTx ? { amount: "1", tx: hbarTx, hashscan: `https://hashscan.io/testnet/transaction/${hbarTx}` } : { skipped: "wallet already holds ≥ 0.5 HBAR" },
      token: { symbol, amount: TOKEN_AMOUNT, address: TEST_TOKEN, tx: mint.hash, hashscan: `https://hashscan.io/testnet/transaction/${mint.hash}` },
    });
  } catch (error) {
    return upstreamFailure("Faucet transaction failed.", describeError(error));
  }
}
