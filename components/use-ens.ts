"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

export interface EnsProfileResponse {
  address: string | null;
  name: string | null;
  avatar: string | null;
  source: "live" | "unconfigured";
}

async function fetchEnsProfile(address: string): Promise<EnsProfileResponse> {
  const response = await fetch(`/api/ens?address=${encodeURIComponent(address)}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`ENS lookup failed (${response.status})`);
  return (await response.json()) as EnsProfileResponse;
}

/**
 * Reverse-resolves an address to a `.eth` name through the server route so the
 * ENS RPC client is never bundled into the browser.
 */
export function useEnsProfile(address: string | null | undefined): UseQueryResult<EnsProfileResponse> {
  return useQuery({
    queryKey: ["ens-profile", address ?? null],
    enabled: typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address),
    staleTime: 10 * 60_000,
    retry: 0,
    queryFn: () => fetchEnsProfile(address as string),
  });
}
