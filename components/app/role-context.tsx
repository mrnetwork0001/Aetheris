"use client";

import * as React from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

import { PRIVY_ENABLED } from "@/components/providers";

export type Role = "operator" | "client";

export interface ClientSummary {
  /** Lower-cased EVM address. */
  address: string;
  jobs: number;
}

/** Minimal EIP-1193 surface the write layer needs. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface RoleState {
  role: Role;
  setRole(next: Role): void;
  /** Connected wallet (lower-cased) or null. */
  wallet: string | null;
  /** Privy finished initialising (or is not mounted at all). */
  walletReady: boolean;
  privyEnabled: boolean;
  /** The agency's operator, lower-cased, from the subgraph. */
  operator: string;
  isOperator: boolean;
  /** The connected wallet has funded at least one indexed job. */
  isClient: boolean;
  /** Number of indexed jobs funded by the connected wallet. */
  myJobs: number;
  clients: ClientSummary[];
  login(): void;
  /** EIP-1193 provider for the connected wallet, switched to Hedera testnet. */
  getProvider(): Promise<Eip1193Provider | null>;
}

const STORAGE_KEY = "aetheris.role";

const RoleContext = React.createContext<RoleState | null>(null);

function readStoredRole(): Role | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "operator" || value === "client" ? value : null;
  } catch {
    return null;
  }
}

function storeRole(role: Role) {
  try {
    window.localStorage.setItem(STORAGE_KEY, role);
  } catch {
    /* storage unavailable - the choice still applies for this session */
  }
}

interface Bridge {
  wallet: string | null;
  ready: boolean;
  login: () => void;
  getProvider: () => Promise<Eip1193Provider | null>;
}

/**
 * Mounted only when Privy is configured (its hooks throw without a provider).
 * Pushes the connected wallet, the login action and a chain-switched provider
 * into the role state.
 */
function PrivyWalletBridge({ onChange }: { onChange: (bridge: Bridge) => void }) {
  const { ready, authenticated, user, login } = usePrivy();
  const { wallets } = useWallets();

  const address = authenticated ? (user?.wallet?.address ?? wallets[0]?.address ?? null) : null;
  const primary = wallets.find((w) => w.address.toLowerCase() === address?.toLowerCase()) ?? wallets[0];

  React.useEffect(() => {
    onChange({
      wallet: address ? address.toLowerCase() : null,
      ready,
      login,
      getProvider: async () => {
        if (!primary) return null;
        try {
          await primary.switchChain(296);
        } catch {
          /* embedded wallets accept the switch; external wallets may prompt or refuse */
        }
        return (await primary.getEthereumProvider()) as Eip1193Provider;
      },
    });
    // `login` and `primary` are stable per render of Privy's state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, ready, primary?.address]);

  return null;
}

export interface RoleProviderProps {
  operator: string;
  clients: ClientSummary[];
  children: React.ReactNode;
}

export function RoleProvider({ operator, clients, children }: RoleProviderProps) {
  const [role, setRoleState] = React.useState<Role>("operator");
  const [bridge, setBridge] = React.useState<Bridge>({
    wallet: null,
    ready: !PRIVY_ENABLED,
    login: () => undefined,
    getProvider: async () => null,
  });
  const manual = React.useRef(false);

  React.useEffect(() => {
    const stored = readStoredRole();
    if (stored) {
      setRoleState(stored);
      manual.current = true;
    }
  }, []);

  const operatorLc = operator.toLowerCase();
  const wallet = bridge.wallet;
  const isOperator = wallet !== null && wallet === operatorLc;
  const myJobs = wallet ? (clients.find((c) => c.address === wallet)?.jobs ?? 0) : 0;
  const isClient = myJobs > 0;

  // Real-time role: the connected wallet decides what the workspace shows,
  // unless the user has explicitly chosen a role in this browser.
  React.useEffect(() => {
    if (!wallet || manual.current) return;
    if (isOperator) setRoleState("operator");
    else if (isClient) setRoleState("client");
  }, [wallet, isOperator, isClient]);

  const setRole = React.useCallback((next: Role) => {
    manual.current = true;
    storeRole(next);
    setRoleState(next);
  }, []);

  const value = React.useMemo<RoleState>(
    () => ({
      role,
      setRole,
      wallet,
      walletReady: bridge.ready,
      privyEnabled: PRIVY_ENABLED,
      operator: operatorLc,
      isOperator,
      isClient,
      myJobs,
      clients,
      login: bridge.login,
      getProvider: bridge.getProvider,
    }),
    [role, setRole, wallet, bridge, operatorLc, isOperator, isClient, myJobs, clients],
  );

  return (
    <RoleContext.Provider value={value}>
      {PRIVY_ENABLED ? <PrivyWalletBridge onChange={setBridge} /> : null}
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): RoleState {
  const ctx = React.useContext(RoleContext);
  if (!ctx) {
    throw new Error("useRole must be used inside <RoleProvider> (app/(app)/layout.tsx).");
  }
  return ctx;
}
