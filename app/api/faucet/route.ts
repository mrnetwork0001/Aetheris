import { NextResponse } from "next/server";
import { Contract, JsonRpcProvider, Network, Wallet, isAddress, parseEther, parseUnits } from "ethers";

import { badRequest, describeError, readJsonObject, upstreamFailure } from "../_lib/http";

/**
 * POST /api/faucet - Hedera TESTNET only.
 *
 * Funds a freshly created wallet so the Client flow can be exercised end to
 * end: 1 HBAR for gas (only if the wallet holds < 0.5), 10 aUSD transferred from
 * the deployer through the HTS token's ERC-20 facade (the recipient's automatic
 * association covers a first receive), and 10 test aUSDC minted from the open
 * `MockERC20.mint`. Both settlement tokens are dripped so the form's selected
 * token is funded either way. Signs with the deployer key; rate-limited so it
 * cannot drain the account. Refuses on any chain other than 296.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Hedera transactions and indexer reads can exceed the 10s default on serverless hosts. */
export const maxDuration = 60;

const CHAIN_ID = 296;
const RPC = process.env.HEDERA_TESTNET_RPC ?? "https://testnet.hashio.io/api";
const TEST_TOKEN = process.env.NEXT_PUBLIC_AETHERIS_TEST_TOKEN ?? "0x21DCc52AbbCAef92B4573dc8B0e1658417c85961";
/** aUSD, the HTS fungible token the agency settles in (6 dp); the deployer holds the float. */
const HTS_TOKEN = (process.env.AETHERIS_HTS_TOKEN_ADDRESS ?? "").trim() || "0x00000000000000000000000000000000009ffBC1";
/** HTS system-contract calls need far more gas than a plain ERC-20 transfer. */
const HTS_GAS = 1_000_000;
const HBAR_TOPUP = parseEther("1");
const HBAR_FLOOR = parseEther("0.5");
const TOKEN_AMOUNT = "10";

const ERC20 = ["function mint(address to, uint256 amount) external", "function decimals() view returns (uint8)", "function symbol() view returns (string)"];
const HTS_ERC20 = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

type Drip = { symbol: string; amount: string; address: string; tx: string; hashscan: string } | { symbol: string; address: string; error: string };

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
    // aUSD over HTS: a real transfer from the deployer's float. Reported, never fatal,
    // so a hiccup on one rail still leaves the other token delivered.
    let hts: Drip;
    try {
      const htsToken = new Contract(HTS_TOKEN, HTS_ERC20, signer);
      const [htsDecimals, htsSymbol, float] = await Promise.all([
        htsToken.decimals() as Promise<bigint>,
        htsToken.symbol() as Promise<string>,
        htsToken.balanceOf(signer.address) as Promise<bigint>,
      ]);
      const htsAmount = parseUnits(TOKEN_AMOUNT, Number(htsDecimals));
      if (float < htsAmount) throw new Error(`deployer float is ${float.toString()} base units, below one drip`);
      const transfer = await htsToken.transfer(to, htsAmount, { gasLimit: HTS_GAS });
      await transfer.wait(1);
      hts = { symbol: htsSymbol, amount: TOKEN_AMOUNT, address: HTS_TOKEN, tx: transfer.hash, hashscan: `https://hashscan.io/testnet/transaction/${transfer.hash}` };
    } catch (error) {
      hts = { symbol: "aUSD", address: HTS_TOKEN, error: describeError(error) };
    }

    const mint = await token.mint(to, parseUnits(TOKEN_AMOUNT, Number(decimals)), { gasLimit: 300_000 });
    await mint.wait(1);
    const erc20: Drip = { symbol, amount: TOKEN_AMOUNT, address: TEST_TOKEN, tx: mint.hash, hashscan: `https://hashscan.io/testnet/transaction/${mint.hash}` };

    return NextResponse.json({
      ok: true,
      to,
      hbar: hbarTx ? { amount: "1", tx: hbarTx, hashscan: `https://hashscan.io/testnet/transaction/${hbarTx}` } : { skipped: "wallet already holds at least 0.5 HBAR" },
      // `token` keeps the original shape (the ERC-20 mint); `tokens` lists every drip.
      token: erc20,
      hts,
      tokens: [hts, erc20],
    });
  } catch (error) {
    return upstreamFailure("Faucet transaction failed.", describeError(error));
  }
}
