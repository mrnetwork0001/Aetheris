/**
 * Shared external targets for the marketing surface. Addresses mirror the
 * README deployment table and `.env.example`; the env override lets a
 * redeploy change them without touching copy.
 */
export const AGENCY_ADDRESS =
  process.env.NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS || "0x16fA9CC838Ab5380F0Ebe3C261a2F57E0FBAbc81";
export const TREASURY_ADDRESS =
  process.env.NEXT_PUBLIC_AETHERIS_TREASURY_ADDRESS ||
  "0x10360383a6b43Fd22BE257bE334E9A9ad83B5598";

export const HASHSCAN_AGENCY = `https://hashscan.io/testnet/contract/${AGENCY_ADDRESS}`;
export const HASHSCAN_TREASURY = `https://hashscan.io/testnet/contract/${TREASURY_ADDRESS}`;

export const GITHUB = "https://github.com/mrnetwork0001/Aetheris";
export const DOCS = `${GITHUB}#readme`;
export const GITHUB_CONTRACTS = `${GITHUB}/tree/main/contracts`;
export const GITHUB_SUBGRAPH = `${GITHUB}/tree/main/subgraph`;
export const GITHUB_SEED = `${GITHUB}/blob/main/scripts/seed.js`;
export const ETHONLINE = "https://ethglobal.com/events/ethonline2026";
export const X_PROFILE = "https://x.com/mrnetwork0001";

export const LAUNCH_APP = "/dashboard";

export const NAV_LINKS: ReadonlyArray<{ href: string; label: string; external?: boolean }> = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#ledger", label: "Ledger" },
  { href: "#faq", label: "FAQ" },
  { href: DOCS, label: "Docs", external: true },
];
