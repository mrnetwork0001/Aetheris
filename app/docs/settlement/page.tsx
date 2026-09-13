import type { Metadata } from "next";

import { A, Addr, Callout, Code, H1, H2, H3, KV, LI, Lede, P, Pre, Prose, UL } from "@/components/docs/prose";
import { TREASURY_ADDRESS } from "@/components/marketing/links";

export const metadata: Metadata = {
  title: "Settlement rails",
  description:
    "How the treasury pays a sub-agent: the Hedera Token Service system contract at 0x167, its int64 response codes, the association rule, the ERC-20 fallback, and the measured gas of each rail.",
};

const HTS_PRECOMPILE = "0x0000000000000000000000000000000000000167";
const AUSD_EVM = "0x00000000000000000000000000000000009ffBC1";
const AUSDC = "0x21DCc52AbbCAef92B4573dc8B0e1658417c85961";

interface SubAgentAccount {
  id: string;
  evm: string;
  role: string;
}

/** The three Hedera-native sub-agents, as listed in scripts/seed.js KNOWN_SUB_AGENTS. */
const SUB_AGENTS: ReadonlyArray<SubAgentAccount> = [
  { id: "0.0.10484674", evm: "0x00000000000000000000000000000000009ffbc2", role: "security-audit" },
  { id: "0.0.10484676", evm: "0x00000000000000000000000000000000009ffbc4", role: "code-generation" },
  { id: "0.0.10484678", evm: "0x00000000000000000000000000000000009ffbc6", role: "market-research" },
];

export default function SettlementPage() {
  return (
    <Prose>
      <p className="mono-label">Protocol</p>
      <H1 className="mt-3">Settlement rails</H1>
      <Lede>
        Every payout the treasury makes goes through one private function, <Code>_payout</Code>. On
        Hedera it asks the Hedera Token Service system contract to move the tokens; if the token is
        not an HTS entity, or HTS says no, it falls back to a plain ERC-20 transfer. Which rail ran is
        never guessed - the <Code>MicroSettlement</Code> event records it.
      </Lede>
      <P>
        The rail logic lives in two files: <Code>contracts/HederaTokenServiceLib.sol</Code>, an{" "}
        <Code>internal</Code> library that wraps the system contract, and{" "}
        <Code>contracts/AetherisTreasury.sol</Code> (<Addr value={TREASURY_ADDRESS} short />), which
        decides when to use it. The library is inlined at compile time: no <Code>delegatecall</Code>,
        no separate deployment.
      </P>

      <H2 id="system-contract">The HTS system contract at 0x167</H2>
      <P>
        On every Hedera network the token service is reachable as an EVM contract at{" "}
        <span className="data-mono break-all">{HTS_PRECOMPILE}</span> (
        <Code>HederaTokenServiceLib.HTS_PRECOMPILE = address(0x167)</Code>). The library calls it with
        the selectors declared in <Code>contracts/interfaces/IHederaTokenService.sol</Code>:{" "}
        <Code>transferToken</Code>, <Code>transferFrom</Code>, <Code>associateToken</Code>,{" "}
        <Code>dissociateToken</Code> and <Code>isToken</Code>. Amounts on the transfer path are{" "}
        <Code>int64</Code>, Hedera&apos;s native integer; <Code>toInt64</Code> range-checks a{" "}
        <Code>uint256</Code> and reverts with <Code>HtsAmountOverflow</Code> above{" "}
        <Code>MAX_HTS_AMOUNT</Code> (<Code>type(int64).max</Code>).
      </P>

      <H2 id="response-codes">int64 response codes, not booleans</H2>
      <P>
        HTS never returns a <Code>bool</Code>. Each call returns a signed 64-bit Hedera response code,
        and a low-level <Code>call</Code> that reports <Code>success == true</Code> only says the EVM
        frame did not revert - the token operation may still have failed. The library therefore
        decodes the code from returndata every time (<Code>_responseCode</Code>) and the{" "}
        <Code>safe*</Code> helpers revert with <Code>HtsCallFailed(selector, responseCode)</Code>,
        carrying the raw code so it can be looked up in Hedera&apos;s <Code>ResponseCodeEnum</Code>.
      </P>
      <KV
        caption="Response codes the library treats specially"
        rows={[
          {
            key: (
              <>
                <Code>SUCCESS</Code> = 22
              </>
            ),
            value: "The only code tryTransferToken accepts as a completed transfer.",
          },
          {
            key: (
              <>
                <Code>UNKNOWN</Code> = 21
              </>
            ),
            value:
              "Hedera's own UNKNOWN, reused by the library for 'no usable returndata': a failed call, fewer than 32 bytes returned, or a word outside the int64 range. Also returned by tryTransferToken for amounts above int64 max.",
          },
          {
            key: (
              <>
                <Code>TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT</Code> = 194
              </>
            ),
            value: "Accepted as success by safeAssociateToken so association is idempotent.",
          },
        ]}
      />
      <Callout label="Why 21 and not 0">
        On Hardhat, Anvil or any chain that is not Hedera, <Code>0x167</Code> is an empty account. The
        EVM makes calls to empty accounts <em>succeed</em> with zero-length returndata, and decoding
        that blindly yields <Code>0</Code>, which is <Code>OK</Code> in Hedera&apos;s enum - a silent false
        positive. <Code>_responseCode</Code> rejects returndata shorter than 32 bytes and reports{" "}
        <Code>UNKNOWN (21)</Code> instead. That single check is what makes the ERC-20 fallback safe to
        run off Hedera, and why the 37 Hardhat tests can exercise the real library code path.
      </Callout>

      <H2 id="library">Library surface</H2>
      <Pre title="contracts/HederaTokenServiceLib.sol">
{`address internal constant HTS_PRECOMPILE = address(0x167);
int64   internal constant SUCCESS = 22;
int64   internal constant UNKNOWN = 21;
int64   internal constant TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT = 194;
uint256 internal constant MAX_HTS_AMOUNT = uint256(uint64(type(int64).max));

error HtsCallFailed(bytes4 selector, int64 responseCode);
error HtsAmountOverflow(uint256 amount);

// transfers
function transferToken(address token, address sender, address receiver, int64 amount)
    internal returns (int64 responseCode);                     // raw code, never reverts
function safeTransferToken(address token, address sender, address receiver, uint256 amount)
    internal;                                                  // reverts unless SUCCESS
function tryTransferToken(address token, address sender, address receiver, uint256 amount)
    internal returns (bool success, int64 responseCode);       // the dual-path primitive
function transferFrom(address token, address from, address to, uint256 amount)
    internal returns (int64 responseCode);

// association
function associateToken(address account, address token) internal returns (int64 responseCode);
function safeAssociateToken(address account, address token) internal returns (int64 responseCode);
function dissociateToken(address account, address token) internal returns (int64 responseCode);

// introspection (staticcall, usable from view)
function isHtsToken(address token) internal view returns (bool);
function isHtsAvailable() internal view returns (bool);

// numeric
function toInt64(uint256 amount) internal pure returns (int64);`}
      </Pre>
      <P>
        <Code>isHtsToken</Code> issues <Code>isToken(token)</Code> as a <Code>staticcall</Code> and
        demands a full 64-byte <Code>(int64, bool)</Code> tuple with <Code>SUCCESS</Code> and{" "}
        <Code>true</Code>; anything else is <Code>false</Code>. <Code>isHtsAvailable</Code> is the same
        probe against the zero address and is what <Code>treasury.htsAvailable()</Code> exposes so the
        deploy script can print which rail a deployment will take.
      </P>

      <H2 id="dual-path">The dual path in the treasury</H2>
      <Pre title="contracts/AetherisTreasury.sol">
{`function _payout(address token, address to, uint256 amount) private returns (bool viaHts) {
    if (htsEnabled && HederaTokenServiceLib.isHtsToken(token)) {
        (bool ok, int64 responseCode) =
            HederaTokenServiceLib.tryTransferToken(token, address(this), to, amount);
        if (ok) {
            return true;
        }
        emit HtsPayoutFallback(token, to, amount, responseCode);
    }

    IERC20(token).safeTransfer(to, amount);
    return false;
}`}
      </Pre>
      <P>
        Three things decide the rail. <Code>htsEnabled</Code> is a master switch the owner can flip with{" "}
        <Code>setHtsEnabled(bool)</Code> - a circuit breaker, and the way to force ERC-20 payouts on a
        non-Hedera fork. <Code>isHtsToken</Code> must positively identify the token. And{" "}
        <Code>tryTransferToken</Code> must come back with <Code>SUCCESS</Code>. If any of the three
        fails the treasury drops to <Code>SafeERC20.safeTransfer</Code>; a failed HTS attempt
        additionally emits <Code>HtsPayoutFallback(token, to, amount, responseCode)</Code> with the raw
        code, so a downgrade is visible on chain rather than silent.
      </P>
      <P>
        <Code>_payout</Code> is shared by <Code>settleSubAgent</Code>, <Code>refundEscrow</Code>,{" "}
        <Code>claimProfit</Code> and <Code>sweepSurplus</Code>, so refunds and margin claims ride the
        same rail as micro-payments.
      </P>

      <H3 id="via-hts">viaHts</H3>
      <P>
        <Code>settleSubAgent</Code> returns <Code>_payout</Code>&apos;s result and emits it as the last
        field of the frozen event{" "}
        <Code>MicroSettlement(jobId, taskId, subAgent, token, amount, viaHts)</Code> (
        <Code>contracts/interfaces/IAetherisEvents.sol</Code>). The subgraph copies it onto the{" "}
        <Code>Settlement</Code> entity as <Code>viaHts: Boolean!</Code> (
        <Code>subgraph/schema.graphql</Code>), which is why the rail can be queried directly:
      </P>
      <Pre title="graphql">{`{ settlements(where: { viaHts: true }) { amount subAgent { id } } }`}</Pre>

      <H2 id="association">Association before receipt</H2>
      <P>
        A Hedera account cannot hold a token it has not associated with, and HTS refuses the transfer
        rather than creating the balance. Two parties need association for an HTS-settled job:
      </P>
      <UL>
        <LI>
          <strong>The treasury</strong>, because <Code>createJob</Code> moves the deposit into it. The
          owner calls <Code>treasury.associateToken(token)</Code> once per HTS token; it runs{" "}
          <Code>safeAssociateToken(address(this), token)</Code> and emits{" "}
          <Code>TokenAssociated(token, responseCode)</Code> with <Code>22</Code> or <Code>194</Code>.{" "}
          <Code>scripts/deploy.js</Code> does this automatically when{" "}
          <Code>AETHERIS_HTS_TOKEN_ADDRESS</Code> is set, and <Code>scripts/seed.js</Code> (
          <Code>ensureTreasuryAssociated</Code>) checks the mirror node first and only sends the
          transaction when it is missing. On a chain without HTS the call reverts with{" "}
          <Code>HtsCallFailed</Code>, which is the correct signal that association does not apply
          there.
        </LI>
        <LI>
          <strong>Every payee</strong>, because <Code>settleSubAgent</Code> credits them. The contract
          cannot associate on someone else&apos;s behalf. When a payee is not associated the HTS
          transfer fails, <Code>HtsPayoutFallback</Code> fires, and the ERC-20 fallback is refused by the
          token for the same reason, so <Code>settleJob</Code> reverts as a whole (test:{" "}
          <Code>reverts settlement when a sub-agent has not associated the HTS token</Code>, where{" "}
          <Code>MockHtsToken</Code> enforces association on both paths).
        </LI>
      </UL>
      <P>
        The tests <Code>associates the treasury through the precompile and is idempotent</Code> and{" "}
        <Code>cannot be funded with an HTS token before the treasury is associated</Code> in{" "}
        <Code>test/aetheris.test.js</Code> pin both rules down, using{" "}
        <Code>contracts/mocks/MockHtsPrecompile.sol</Code> installed at <Code>0x167</Code> with{" "}
        <Code>hardhat_setCode</Code> and <Code>contracts/mocks/MockHtsToken.sol</Code>, which models
        mandatory association.
      </P>

      <H3 id="seeded-accounts">How the seeded sub-agent accounts were created</H3>
      <P>
        The three Hedera-native payees were created once, with the Hedera SDK, by the first version of{" "}
        <Code>scripts/seed.js</Code> (git commit <Code>93ea725</Code>): an{" "}
        <Code>AccountCreateTransaction</Code> with <Code>setKeyWithoutAlias(publicKey)</Code>, a 1 HBAR
        initial balance and <Code>setMaxAutomaticTokenAssociations(-1)</Code>. The <Code>-1</Code> means
        unlimited automatic association: the account accepts any token sent to it without an explicit
        association handshake, which removes the per-payee step the treasury would otherwise depend
        on. Creating the key without an alias gives each account a long-zero EVM address (the account
        number in the last eight bytes), which is why they look the way they do in the subgraph. The
        current <Code>scripts/seed.js</Code> reuses these accounts from its{" "}
        <Code>KNOWN_SUB_AGENTS</Code> roster instead of provisioning new ones.
      </P>
      <KV
        caption="Seeded sub-agent accounts"
        rows={SUB_AGENTS.map((agent) => ({
          key: (
            <>
              <Addr value={agent.id} kind="account" /> <span className="mono-label">{agent.role}</span>
            </>
          ),
          value: <Addr value={agent.evm} kind="account" />,
        }))}
      />

      <H2 id="gas">Measured gas</H2>
      <P>
        Both rails have been exercised on testnet with the same contracts. From the seeded lifecycle
        (<Code>README.md</Code>):
      </P>
      <KV
        caption="Gas per settlement rail"
        rows={[
          {
            key: "Hedera Token Service",
            value: (
              <>
                <span className="data-mono">2,360,527</span> gas. Token aUSD{" "}
                <Addr value="0.0.10484673" kind="token" /> (<Addr value={AUSD_EVM} kind="token" short />,
                6 decimals). 6 settlements on chain with <Code>viaHts = true</Code> (jobs 1 and 5).
              </>
            ),
          },
          {
            key: "ERC-20 fallback",
            value: (
              <>
                <span className="data-mono">229,111</span> gas. Token aUSDC <Addr value={AUSDC} short />{" "}
                (test ERC-20, 6 decimals, open mint). 4 settlements on chain with{" "}
                <Code>viaHts = false</Code> (jobs 2 and 6).
              </>
            ),
          },
        ]}
      />
      <P>
        The roughly tenfold difference is the system contract doing real work rather than an EVM
        storage write. It is also why the scripts set explicit limits: <Code>scripts/seed.js</Code> uses
        a 1,000,000 gas limit for <Code>createJob</Code> and <Code>associateToken</Code> (
        <Code>HTS_GAS</Code>) and 3,000,000 for <Code>settleJob</Code>, and <Code>lib/write.ts</Code> sends{" "}
        <Code>refundJob</Code> from the browser with 1,000,000.
      </P>

      <H2 id="off-hedera">Off Hedera</H2>
      <P>
        Nothing in the contracts assumes Hedera. On a chain where <Code>0x167</Code> is empty,{" "}
        <Code>isHtsToken</Code> returns <Code>false</Code>, <Code>_payout</Code> never touches HTS and every
        settlement is a plain ERC-20 transfer with <Code>viaHts = false</Code>. The test{" "}
        <Code>wires the treasury to the agency and reports HTS as unavailable off-Hedera</Code> checks
        exactly that, and <Code>still uses the ERC-20 fallback for non-HTS tokens on a Hedera-like chain</Code>{" "}
        checks the reverse: with the mock precompile installed, a non-HTS token still takes the
        ERC-20 route.
      </P>

      <H2 id="read-next">Read next</H2>
      <UL>
        <LI>
          <A href="/docs/jobs-and-escrow">Jobs &amp; escrow</A> - the job and task states that lead up
          to <Code>settleJob</Code>.
        </LI>
        <LI>
          <A href="/docs/subgraph">The Graph subgraph</A> - querying settlements by rail.
        </LI>
      </UL>
    </Prose>
  );
}
