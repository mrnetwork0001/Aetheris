"use client";

import * as React from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { privyAppId, privyConfig } from "@/lib/privy";

type PrivyClientConfig = React.ComponentProps<typeof PrivyProvider>["config"];

/**
 * Privy hard-fails when handed a placeholder app id, so the whole provider is
 * mounted conditionally and the UI falls back to a clearly-labelled demo
 * session. Real Privy app ids are 20+ char cuids.
 */
export const PRIVY_ENABLED: boolean =
  typeof privyAppId === "string" && /^[a-z0-9]{18,}$/i.test(privyAppId.trim());

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(makeQueryClient);

  const tree = <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

  if (!PRIVY_ENABLED) return tree;

  return (
    <PrivyProvider appId={privyAppId} config={privyConfig as unknown as PrivyClientConfig}>
      {tree}
    </PrivyProvider>
  );
}
