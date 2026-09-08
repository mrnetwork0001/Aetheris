import { NextResponse } from "next/server";

import type { SwapQuote } from "@/lib/oneinch";
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
 * POST /api/swap/quote
 *
 * Proxies the 1inch Swap API v6.0 quote endpoint. `ONEINCH_API_KEY` lives only
 * on the server, so the treasury panel calls this route rather than 1inch.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface QuoteResponse {
  quote: SwapQuote;
  chainId: number;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  const { chainId, src, dst, amount } = body.value;

  if (!isChainId(chainId)) return badRequest("`chainId` must be a positive integer.");
  if (!isAddress(src)) return badRequest("`src` must be a 0x-prefixed 20-byte token address.");
  if (!isAddress(dst)) return badRequest("`dst` must be a 0x-prefixed 20-byte token address.");
  if (src.toLowerCase() === dst.toLowerCase()) {
    return badRequest("`src` and `dst` must be different tokens.");
  }
  if (!isBaseUnitAmount(amount)) {
    return badRequest("`amount` must be a non-zero decimal string in the source token's base units.");
  }

  let oneInch: typeof import("@/lib/oneinch");
  try {
    oneInch = await import("@/lib/oneinch");
  } catch (error) {
    return notConfigured("1inch integration is not available.", describeError(error));
  }

  if (!oneInch.SUPPORTED_CHAINS.some((chain) => chain.id === chainId)) {
    return badRequest(
      `Chain ${chainId} is not supported by this deployment.`,
      `Supported: ${oneInch.SUPPORTED_CHAINS.map((c) => `${c.name} (${c.id})`).join(", ")}.`,
    );
  }

  try {
    const quote = await oneInch.getQuote({ chainId, src, dst, amount });
    return NextResponse.json<QuoteResponse>({ quote, chainId });
  } catch (error) {
    return upstreamFailure("1inch quote request failed.", describeError(error));
  }
}
