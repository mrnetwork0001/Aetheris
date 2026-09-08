/**
 * Privy configuration for Aetheris operator onboarding (@privy-io/react-auth v3).
 *
 * This module exports **configuration only** — no React components. The frontend
 * owns `<PrivyProvider appId={privyAppId} config={privyConfig}>`.
 *
 * Bounty-relevant choices:
 *  • `passkey` is a first-class login method (zero-friction, no-seed-phrase onboarding).
 *  • Embedded wallets are created automatically on login for users without one,
 *    so a non-crypto enterprise client gets a self-custodial wallet by signing in.
 *  • Hedera Testnet (296) is the default chain — Aetheris settles there — with the
 *    1inch rebalancing venues listed as additional supported chains.
 *
 * `NEXT_PUBLIC_PRIVY_APP_ID` is public by design (Privy's app id is not a secret);
 * `PRIVY_APP_SECRET` is used only by server-side token verification and is never
 * referenced in this file.
 */

import { aetherisChains, hederaTestnet } from './chains';
import { publicEnv } from './env';

/** Privy app id from the dashboard. Empty string when unconfigured (never throws at import). */
export const privyAppId: string = publicEnv.privyAppId;

/** Login methods offered on the Privy modal, in display order. */
export const privyLoginMethods = ['email', 'google', 'passkey', 'wallet'] as const;

/** The chain Aetheris operates on by default (Hedera Testnet EVM, id 296). */
export const privyDefaultChain = hederaTestnet;

/**
 * Config object passed straight to `<PrivyProvider config={...}>`.
 *
 * Typed as `Record<string, unknown>` per the shared Aetheris API contract; the
 * literal below is structurally a valid `PrivyClientConfig` for v3.
 */
export const privyConfig: Record<string, unknown> = {
  // ── Auth ────────────────────────────────────────────────────────────────
  loginMethods: [...privyLoginMethods],

  // ── Embedded wallets: created on login, self-custodial, passkey-secured ──
  embeddedWallets: {
    ethereum: {
      // Every operator who signs in without a wallet gets one provisioned.
      createOnLogin: 'users-without-wallets',
    },
    // Keep Privy's wallet UIs so users can see/confirm treasury transactions.
    showWalletUIs: true,
  },

  // ── Chains ──────────────────────────────────────────────────────────────
  defaultChain: privyDefaultChain,
  supportedChains: [...aetherisChains],

  // ── Appearance ──────────────────────────────────────────────────────────
  appearance: {
    theme: 'dark',
    accentColor: '#7C5CFF',
    logo: '/aetheris-mark.svg',
    walletChainType: 'ethereum-only',
    showWalletLoginFirst: false,
  },

  // ── Security ────────────────────────────────────────────────────────────
  mfa: {
    noPromptOnMfaRequired: false,
  },
};

/**
 * Whether Privy is configured well enough to mount the provider.
 * Lets the UI render a clear "set NEXT_PUBLIC_PRIVY_APP_ID" state instead of crashing.
 *
 * @returns True when a non-empty app id is present.
 */
export function isPrivyConfigured(): boolean {
  return privyAppId.trim().length > 0;
}
