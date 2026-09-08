import { NextResponse } from "next/server";

import {
  badRequest,
  describeError,
  isAddress,
  isBaseUnitAmount,
  isChainId,
  notConfigured,
  readJsonObject,
  upstreamFailure,
} from "../../_lib/http";

/**
 * POST /api/swap/build
 *
 * Returns an unsigned 1inch swap calldata payload for the treasury to sign.
 * This route never signs or broadcasts — it only assembles the transaction.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface BuildResponse {
  tx: { to: string; data: string; value: string; gas?: string };
  chainId: number;
}

function parseSlippage(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0 || value > 50) return null;
  return value;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  const { chainId, src, dst, amount, from } = body.value;

  if (!isChainId(chainId)) return badRequest("`chainId` must be a positive integer.");
  if (!isAddress(src)) return badRequest("`src` must be a 0x-prefixed 20-byte token address.");
  if (!isAddress(dst)) return badRequest("`dst` must be a 0x-prefixed 20-byte token address.");
  if (src.toLowerCase() === dst.toLowerCase()) {
    return badRequest("`src` and `dst` must be different tokens.");
  }
  if (!isBaseUnitAmount(amount)) {
    return badRequest("`amount` must be a non-zero decimal string in the source token's base units.");
  }
  if (!isAddress(from)) {
    return badRequest("`from` must be the 0x-prefixed address executing the swap.");
  }

  const slippage = parseSlippage(body.value.slippage);
  if (slippage === null) {
    return badRequest("`slippage`, when provided, must be a number greater than 0 and at most 50.");
  }

  let oneInch: typeof import("@/lib/oneinch");
  try {
    oneInch = await import("@/lib/oneinch");
  } catch (error) {
    return notConfigured("1inch integration is not available.", describeError(error));
  }

  if (!oneInch.SUPPORTED_CHAINS.some((chain) => chain.id === chainId)) {
    return badRequest(`Chain ${chainId} is not supported by this deployment.`);
  }

  try {
    const tx = await oneInch.buildSwapTx({
      chainId,
      src,
      dst,
      amount,
      from,
      ...(slippage === undefined ? {} : { slippage }),
    });
    return NextResponse.json<BuildResponse>({ tx, chainId });
  } catch (error) {
    return upstreamFailure("1inch swap build failed.", describeError(error));
  }
}
