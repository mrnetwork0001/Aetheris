/**
 * Aetheris domain model + clearly-labelled demo fixtures.
 *
 * The subgraph and the Hedera contracts are not deployed on every environment,
 * so the UI is built to degrade: each loader returns a `DataEnvelope` carrying
 * a `source` discriminator. Anything rendered from `source: "demo"` MUST be
 * visibly badged in the UI so nothing is ever passed off as live chain data.
 *
 * NOTE: this file intentionally lives under `components/` — `lib/` is owned by
 * another workstream and must not be touched.
 */

/* ────────────────────────────────────────────────────────────────────────────
   Types — mirrored from contracts/interfaces/IAetherisEvents.sol
   ──────────────────────────────────────────────────────────────────────────── */

/** Mirrors `IAetherisEvents.JobStatus`. */
export type JobStatus = "Funded" | "Dispatched" | "Completed" | "Settled" | "Refunded";

/** Mirrors `IAetherisEvents.TaskStatus`. */
export type TaskStatus = "Assigned" | "Completed" | "Paid" | "Cancelled";

export interface SubTask {
  taskId: string;
  subAgent: string;
  subAgentName: string;
  role: string;
  /** Fee in base units of `tokenSymbol`. */
  feeRaw: string;
  status: TaskStatus;
  /** HCS sequence number that anchors the completion receipt. */
  hcsSequenceNumber?: string;
  /** Milliseconds from assignment to on-chain settlement. */
  settlementMs?: number;
}

export interface Job {
  jobId: string;
  title: string;
  client: string;
  clientName?: string | null;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  /** Client deposit in base units. */
  depositRaw: string;
  /** Net margin retained by the treasury, base units. Present once settled. */
  netMarginRaw?: string;
  specURI: string;
  status: JobStatus;
  createdAt: number;
  tasks: SubTask[];
}

export interface SubAgentRow {
  address: string;
  ensName: string | null;
  role: string;
  tasksCompleted: number;
  /** Lifetime earnings in USD-equivalent base units (6 decimals). */
  totalEarnedRaw: string;
  /** 0–1. */
  successRate: number;
  avgSettlementMs: number;
}

export interface AgencyStats {
  agency: string;
  ensName: string | null;
  operator: string;
  totalJobs: number;
  activeJobs: number;
  settledJobs: number;
  /** Treasury AUM in USD-equivalent base units (6 decimals). */
  treasuryRaw: string;
  /** Lifetime margin retained, base units (6 decimals). */
  lifetimeMarginRaw: string;
  subAgentCount: number;
  hcsMessageCount: number;
  /** Average Hedera consensus finality observed, milliseconds. */
  avgFinalityMs: number;
}

export interface HcsMessage {
  sequenceNumber: string;
  contents: string;
  consensusTimestamp: string;
}

export interface TreasuryHolding {
  symbol: string;
  name: string;
  address: string;
  chainId: number;
  chainName: string;
  decimals: number;
  amountRaw: string;
  usdValue: number;
  /** Target allocation as a fraction of AUM, 0–1. */
  targetWeight: number;
}

export interface SettlementRow {
  jobId: string;
  taskId: string;
  subAgent: string;
  subAgentName: string;
  amountRaw: string;
  tokenSymbol: string;
  decimals: number;
  viaHts: boolean;
  timestamp: number;
  txId: string;
}

/** Every loader returns this so the UI can badge non-live data honestly. */
export type DataSource = "live" | "demo";

export interface DataEnvelope<T> {
  data: T;
  source: DataSource;
  /** Present when a live fetch was attempted and failed. */
  error?: string;
}

/* ────────────────────────────────────────────────────────────────────────────
   Demo fixtures
   ──────────────────────────────────────────────────────────────────────────── */

export const DEMO_AGENCY_ADDRESS = "0x7Ae3b1F92c0D4e5A6b81C2fD3e94A05B7c1d8E42";
export const DEMO_OPERATOR_ADDRESS = "0x4C9a25E3fD70b81A6c3E52D9f4B0a17C8e6D3aF1";
export const DEMO_HCS_TOPIC = "0.0.4915302";

export const DEMO_STATS: AgencyStats = {
  agency: DEMO_AGENCY_ADDRESS,
  ensName: "aetheris.eth",
  operator: DEMO_OPERATOR_ADDRESS,
  totalJobs: 148,
  activeJobs: 4,
  settledJobs: 144,
  treasuryRaw: "465176000000",
  lifetimeMarginRaw: "98442110000",
  subAgentCount: 24,
  hcsMessageCount: 8_912,
  avgFinalityMs: 1_940,
};

export const DEMO_JOBS: Job[] = [
  {
    jobId: "148",
    title: "Smart-contract security audit — LiquidStake v2 vault",
    client: "0x8E3F27b41c0A9d5E6f2B83c7D14a09E5B6f3C218",
    clientName: "liquidstake.eth",
    token: "0x0000000000000000000000000000000000068cDa",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    depositRaw: "2400000000",
    specURI: "ipfs://bafybeigd7yaudit2vaultspec9x2ldq",
    status: "Dispatched",
    createdAt: 1_788_826_140_000,
    tasks: [
      {
        taskId: "1",
        subAgent: "0x1F0b8a4C2e5D93A7b6C1e04F8d2A93B5c7E10D64",
        subAgentName: "sentinel.aetheris.eth",
        role: "Static analysis + invariant fuzzing",
        feeRaw: "620000000",
        status: "Paid",
        hcsSequenceNumber: "8907",
        settlementMs: 1_820,
      },
      {
        taskId: "2",
        subAgent: "0x93C4d0Ea27B15f6A8c3D9E04b7F251A6c8D3B097",
        subAgentName: "forge.aetheris.eth",
        role: "Exploit PoC generation",
        feeRaw: "480000000",
        status: "Completed",
        hcsSequenceNumber: "8910",
        settlementMs: 2_140,
      },
      {
        taskId: "3",
        subAgent: "0xB2e71A05c8D34f96a1E7C05b3D82F1a4C9e60D75",
        subAgentName: "scribe.aetheris.eth",
        role: "Remediation report drafting",
        feeRaw: "310000000",
        status: "Assigned",
      },
    ],
  },
  {
    jobId: "147",
    title: "Market intelligence synthesis — L2 perp DEX order flow",
    client: "0x5B2c96E1a4D07f83b6C2E15d9A04F7b3C8e1D296",
    clientName: "delphi-labs.eth",
    token: "0x0000000000000000000000000000000000068cDa",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    depositRaw: "1150000000",
    specURI: "ipfs://bafybeihq3marketintel7lz8v",
    status: "Completed",
    createdAt: 1_788_739_800_000,
    tasks: [
      {
        taskId: "1",
        subAgent: "0x6D1a83F04c9B27e5a8C3D016b4E92F7a5C8D30B1",
        subAgentName: "oracle.aetheris.eth",
        role: "On-chain flow aggregation",
        feeRaw: "410000000",
        status: "Paid",
        hcsSequenceNumber: "8871",
        settlementMs: 1_670,
      },
      {
        taskId: "2",
        subAgent: "0xB2e71A05c8D34f96a1E7C05b3D82F1a4C9e60D75",
        subAgentName: "scribe.aetheris.eth",
        role: "Narrative synthesis",
        feeRaw: "265000000",
        status: "Paid",
        hcsSequenceNumber: "8884",
        settlementMs: 1_910,
      },
    ],
  },
  {
    jobId: "146",
    title: "Autonomous branding kit — Nyx Protocol launch",
    client: "0xA71c3E5D09b84f26a5C1D703e8B49F2a6C0D31E8",
    clientName: "nyx.eth",
    token: "0x0000000000000000000000000000000000068cDa",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    depositRaw: "780000000",
    netMarginRaw: "196000000",
    specURI: "ipfs://bafybeicbrandkit4nyx1qm",
    status: "Settled",
    createdAt: 1_788_655_500_000,
    tasks: [
      {
        taskId: "1",
        subAgent: "0xE04b1C7a29D5836f4A1c0E92b7D354F6a8C1D203",
        subAgentName: "muse.aetheris.eth",
        role: "Visual identity generation",
        feeRaw: "395000000",
        status: "Paid",
        hcsSequenceNumber: "8802",
        settlementMs: 2_030,
      },
      {
        taskId: "2",
        subAgent: "0xB2e71A05c8D34f96a1E7C05b3D82F1a4C9e60D75",
        subAgentName: "scribe.aetheris.eth",
        role: "Brand voice + copy system",
        feeRaw: "189000000",
        status: "Paid",
        hcsSequenceNumber: "8815",
        settlementMs: 1_760,
      },
    ],
  },
  {
    jobId: "145",
    title: "Solidity codegen — ERC-4626 adapter for HTS collateral",
    client: "0x2C8e91A3b05D74f16a9C3E027b5D48F1a7C6D390",
    clientName: null,
    token: "0x0000000000000000000000000000000000068cDa",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    depositRaw: "1600000000",
    specURI: "ipfs://bafybeif4626adapterhts8k",
    status: "Dispatched",
    createdAt: 1_788_570_200_000,
    tasks: [
      {
        taskId: "1",
        subAgent: "0x93C4d0Ea27B15f6A8c3D9E04b7F251A6c8D3B097",
        subAgentName: "forge.aetheris.eth",
        role: "Contract scaffolding + tests",
        feeRaw: "740000000",
        status: "Completed",
        hcsSequenceNumber: "8848",
        settlementMs: 2_210,
      },
      {
        taskId: "2",
        subAgent: "0x1F0b8a4C2e5D93A7b6C1e04F8d2A93B5c7E10D64",
        subAgentName: "sentinel.aetheris.eth",
        role: "Pre-deploy invariant review",
        feeRaw: "420000000",
        status: "Assigned",
      },
    ],
  },
  {
    jobId: "144",
    title: "Tokenomics stress simulation — 10k Monte-Carlo paths",
    client: "0xF35a17C90b2D486e1A7c3D50b9E24F8a6C1D073B",
    clientName: "aera.eth",
    token: "0x0000000000000000000000000000000000068cDa",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    depositRaw: "3200000000",
    specURI: "ipfs://bafybeitokenomics10kmc2v",
    status: "Funded",
    createdAt: 1_788_484_900_000,
    tasks: [],
  },
  {
    jobId: "143",
    title: "Compliance narrative synthesis — MiCA disclosure pack",
    client: "0x9A4c02E7b1D53f86a2C1E940b7D35F2a8C6D1047",
    clientName: null,
    token: "0x0000000000000000000000000000000000068cDa",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    depositRaw: "900000000",
    netMarginRaw: "231000000",
    specURI: "ipfs://bafybeimicacompliancepack3h",
    status: "Settled",
    createdAt: 1_788_397_400_000,
    tasks: [
      {
        taskId: "1",
        subAgent: "0x7C3e15A08b9D642f1A5c0E83b7D294F6a1C8D520",
        subAgentName: "ledger.aetheris.eth",
        role: "Regulatory mapping",
        feeRaw: "352000000",
        status: "Paid",
        hcsSequenceNumber: "8760",
        settlementMs: 1_580,
      },
      {
        taskId: "2",
        subAgent: "0xB2e71A05c8D34f96a1E7C05b3D82F1a4C9e60D75",
        subAgentName: "scribe.aetheris.eth",
        role: "Disclosure drafting",
        feeRaw: "317000000",
        status: "Paid",
        hcsSequenceNumber: "8768",
        settlementMs: 1_720,
      },
    ],
  },
];

export const DEMO_SUB_AGENTS: SubAgentRow[] = [
  {
    address: "0x1F0b8a4C2e5D93A7b6C1e04F8d2A93B5c7E10D64",
    ensName: "sentinel.aetheris.eth",
    role: "Security Audit",
    tasksCompleted: 128,
    totalEarnedRaw: "41280000000",
    successRate: 0.992,
    avgSettlementMs: 1_810,
  },
  {
    address: "0x93C4d0Ea27B15f6A8c3D9E04b7F251A6c8D3B097",
    ensName: "forge.aetheris.eth",
    role: "Code Generation",
    tasksCompleted: 114,
    totalEarnedRaw: "36740000000",
    successRate: 0.974,
    avgSettlementMs: 2_160,
  },
  {
    address: "0x6D1a83F04c9B27e5a8C3D016b4E92F7a5C8D30B1",
    ensName: "oracle.aetheris.eth",
    role: "Market Research",
    tasksCompleted: 96,
    totalEarnedRaw: "27310000000",
    successRate: 0.968,
    avgSettlementMs: 1_640,
  },
  {
    address: "0xB2e71A05c8D34f96a1E7C05b3D82F1a4C9e60D75",
    ensName: "scribe.aetheris.eth",
    role: "Technical Writing",
    tasksCompleted: 141,
    totalEarnedRaw: "24905000000",
    successRate: 0.986,
    avgSettlementMs: 1_720,
  },
  {
    address: "0xE04b1C7a29D5836f4A1c0E92b7D354F6a8C1D203",
    ensName: "muse.aetheris.eth",
    role: "Branding & Design",
    tasksCompleted: 73,
    totalEarnedRaw: "19420000000",
    successRate: 0.951,
    avgSettlementMs: 2_040,
  },
  {
    address: "0x7C3e15A08b9D642f1A5c0E83b7D294F6a1C8D520",
    ensName: "ledger.aetheris.eth",
    role: "Financial Modeling",
    tasksCompleted: 61,
    totalEarnedRaw: "15870000000",
    successRate: 0.977,
    avgSettlementMs: 1_580,
  },
  {
    address: "0x38D9a71C05b4E263f8A1c0D95b7E34F2a6C1D8B0",
    ensName: null,
    role: "Data Labelling",
    tasksCompleted: 44,
    totalEarnedRaw: "8210000000",
    successRate: 0.933,
    avgSettlementMs: 1_490,
  },
];

export const DEMO_TREASURY: TreasuryHolding[] = [
  {
    symbol: "USDC",
    name: "USD Coin (HTS)",
    address: "0x0000000000000000000000000000000000068cDa",
    chainId: 296,
    chainName: "Hedera Testnet",
    decimals: 6,
    amountRaw: "184920000000",
    usdValue: 184_920,
    targetWeight: 0.35,
  },
  {
    symbol: "HBAR",
    name: "Hedera",
    address: "0x0000000000000000000000000000000000163B5a",
    chainId: 296,
    chainName: "Hedera Testnet",
    decimals: 8,
    amountRaw: "4123000000000",
    usdValue: 96_412,
    targetWeight: 0.2,
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    chainId: 42161,
    chainName: "Arbitrum",
    decimals: 18,
    amountRaw: "21400000000000000000",
    usdValue: 78_190,
    targetWeight: 0.15,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    chainId: 42161,
    chainName: "Arbitrum",
    decimals: 6,
    amountRaw: "52300000000",
    usdValue: 52_300,
    targetWeight: 0.15,
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    chainId: 137,
    chainName: "Polygon",
    decimals: 6,
    amountRaw: "34180000000",
    usdValue: 34_180,
    targetWeight: 0.1,
  },
  {
    symbol: "DAI",
    name: "Dai Stablecoin",
    address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    chainId: 8453,
    chainName: "Base",
    decimals: 18,
    amountRaw: "19174000000000000000000",
    usdValue: 19_174,
    targetWeight: 0.05,
  },
];

export const DEMO_SETTLEMENTS: SettlementRow[] = [
  {
    jobId: "148",
    taskId: "1",
    subAgent: "0x1F0b8a4C2e5D93A7b6C1e04F8d2A93B5c7E10D64",
    subAgentName: "sentinel.aetheris.eth",
    amountRaw: "620000000",
    tokenSymbol: "USDC",
    decimals: 6,
    viaHts: true,
    timestamp: 1_788_827_960_000,
    txId: "0.0.4915188@1788827960.114820033",
  },
  {
    jobId: "147",
    taskId: "2",
    subAgent: "0xB2e71A05c8D34f96a1E7C05b3D82F1a4C9e60D75",
    subAgentName: "scribe.aetheris.eth",
    amountRaw: "265000000",
    tokenSymbol: "USDC",
    decimals: 6,
    viaHts: true,
    timestamp: 1_788_741_710_000,
    txId: "0.0.4915188@1788741710.883014720",
  },
  {
    jobId: "147",
    taskId: "1",
    subAgent: "0x6D1a83F04c9B27e5a8C3D016b4E92F7a5C8D30B1",
    subAgentName: "oracle.aetheris.eth",
    amountRaw: "410000000",
    tokenSymbol: "USDC",
    decimals: 6,
    viaHts: true,
    timestamp: 1_788_741_470_000,
    txId: "0.0.4915188@1788741470.402118655",
  },
  {
    jobId: "146",
    taskId: "2",
    subAgent: "0xB2e71A05c8D34f96a1E7C05b3D82F1a4C9e60D75",
    subAgentName: "scribe.aetheris.eth",
    amountRaw: "189000000",
    tokenSymbol: "USDC",
    decimals: 6,
    viaHts: false,
    timestamp: 1_788_657_260_000,
    txId: "0.0.4915188@1788657260.559743201",
  },
  {
    jobId: "146",
    taskId: "1",
    subAgent: "0xE04b1C7a29D5836f4A1c0E92b7D354F6a8C1D203",
    subAgentName: "muse.aetheris.eth",
    amountRaw: "395000000",
    tokenSymbol: "USDC",
    decimals: 6,
    viaHts: true,
    timestamp: 1_788_657_030_000,
    txId: "0.0.4915188@1788657030.771290844",
  },
  {
    jobId: "143",
    taskId: "2",
    subAgent: "0xB2e71A05c8D34f96a1E7C05b3D82F1a4C9e60D75",
    subAgentName: "scribe.aetheris.eth",
    amountRaw: "317000000",
    tokenSymbol: "USDC",
    decimals: 6,
    viaHts: true,
    timestamp: 1_788_399_120_000,
    txId: "0.0.4915188@1788399120.216905337",
  },
];

/** Seed frames for the HCS audit feed — shaped exactly like `readHcsMessages`. */
export const DEMO_HCS_MESSAGES: HcsMessage[] = [
  {
    sequenceNumber: "8912",
    contents: JSON.stringify({
      evt: "TaskCompleted",
      jobId: 148,
      taskId: 2,
      agent: "forge.aetheris.eth",
      resultHash: "0x9f3c…a71e",
    }),
    consensusTimestamp: "1788828144.882301569",
  },
  {
    sequenceNumber: "8911",
    contents: JSON.stringify({
      evt: "SubAgentAssigned",
      jobId: 148,
      taskId: 3,
      agent: "scribe.aetheris.eth",
      role: "Remediation report drafting",
      fee: "310.00 USDC",
    }),
    consensusTimestamp: "1788828061.114820004",
  },
  {
    sequenceNumber: "8910",
    contents: JSON.stringify({
      evt: "MicroSettlement",
      jobId: 148,
      taskId: 1,
      agent: "sentinel.aetheris.eth",
      amount: "620.00 USDC",
      viaHts: true,
    }),
    consensusTimestamp: "1788827960.402118683",
  },
  {
    sequenceNumber: "8909",
    contents: JSON.stringify({
      evt: "TaskCompleted",
      jobId: 148,
      taskId: 1,
      agent: "sentinel.aetheris.eth",
      findings: { high: 1, medium: 3, low: 7 },
    }),
    consensusTimestamp: "1788827894.559743166",
  },
  {
    sequenceNumber: "8908",
    contents: JSON.stringify({
      evt: "TreasuryRebalanced",
      from: "USDT",
      to: "USDC",
      amountIn: "12500.00",
      amountOut: "12497.31",
      dstChainId: 296,
      via: "1inch v6.0",
    }),
    consensusTimestamp: "1788827702.771290779",
  },
  {
    sequenceNumber: "8907",
    contents: JSON.stringify({
      evt: "JobCreated",
      jobId: 148,
      client: "liquidstake.eth",
      deposit: "2400.00 USDC",
      spec: "ipfs://bafybeigd7yaudit2vaultspec9x2ldq",
    }),
    consensusTimestamp: "1788826140.216905355",
  },
  {
    sequenceNumber: "8906",
    contents: JSON.stringify({
      evt: "OperatorVerified",
      operator: "aetheris.eth",
      level: "orb",
      nullifier: "0x2b1d…c904",
    }),
    consensusTimestamp: "1788825918.640173912",
  },
  {
    sequenceNumber: "8905",
    contents: JSON.stringify({
      evt: "JobSettled",
      jobId: 146,
      gross: "780.00 USDC",
      paidToSubAgents: "584.00 USDC",
      netMargin: "196.00 USDC",
    }),
    consensusTimestamp: "1788657480.305928469",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
   Deterministic per-agency variation so /agency/[id] never renders an empty page
   ──────────────────────────────────────────────────────────────────────────── */

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Scales the demo stats deterministically from an agency id/address. */
export function demoStatsFor(id: string): AgencyStats {
  const h = hashString(id.toLowerCase());
  const scale = 0.55 + ((h % 90) / 100);
  const looksLikeEns = id.toLowerCase().endsWith(".eth");
  const scaleRaw = (raw: string): string =>
    String(BigInt(Math.round(Number(raw) * scale)));

  return {
    ...DEMO_STATS,
    agency: id.startsWith("0x") ? id : DEMO_AGENCY_ADDRESS,
    ensName: looksLikeEns ? id.toLowerCase() : DEMO_STATS.ensName,
    totalJobs: 40 + (h % 180),
    activeJobs: 2 + (h % 11),
    settledJobs: 34 + (h % 160),
    treasuryRaw: scaleRaw(DEMO_STATS.treasuryRaw),
    lifetimeMarginRaw: scaleRaw(DEMO_STATS.lifetimeMarginRaw),
    subAgentCount: 6 + (h % 26),
    hcsMessageCount: 1_200 + (h % 9_000),
    avgFinalityMs: 1_500 + (h % 900),
  };
}
