/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SERVER-ONLY MODULE — World ID readiness probe.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Answers, from evidence rather than env-var presence, whether this server can
 * relay a REAL World ID proof:
 *
 *   - app id present and accepted by the Developer Portal (`/api/v2/verify/{app}`
 *     answers anything but `not_found`);
 *   - the configured action exists under that app (the verifier's reply to a
 *     deliberately invalid proof is `invalid_proof`/`invalid_merkle_root`…, NOT
 *     `invalid_action`);
 *   - relying-party credentials exist so IDKit v4 can open at all.
 *
 * The probe sends a throwaway, obviously-invalid proof. It is cached for 60 s per
 * process so a dashboard render never hammers the verifier.
 */

import { assertServerOnly, optionalEnv } from './env';

export type WorldIdActionStatus =
  /** App and action both exist — a genuine proof would be verified. */
  | 'ok'
  /** App exists but the action id is not registered in the Developer Portal. */
  | 'action-missing'
  /** The Developer Portal does not know this app id (or it is inactive). */
  | 'app-not-found'
  /** Could not reach the verifier (or got an unexpected reply). */
  | 'unknown'
  /** NEXT_PUBLIC_WORLD_ID_APP_ID is not set. */
  | 'unconfigured';

export interface WorldIdReadiness {
  appId: string;
  action: string;
  appIdValid: boolean;
  /** WORLD_ID_RP_ID and WORLD_ID_RP_SIGNING_KEY are both present. */
  rpConfigured: boolean;
  actionStatus: WorldIdActionStatus;
  /** True only when app, action and RP credentials are all in place. */
  relayable: boolean;
  /** Plain-language summary of the blocking gap (empty when `relayable`). */
  detail: string;
  /** Unix ms when the verifier was last asked. */
  checkedAt: number;
}

const CACHE_TTL_MS = 60_000;
const PROBE_TIMEOUT_MS = 4_000;
const DEFAULT_API_BASE = 'https://developer.worldcoin.org';
const APP_ID_RE = /^app_[a-zA-Z0-9_]+$/;

type CacheSlot = { key: string; value: WorldIdReadiness };
const store = globalThis as typeof globalThis & { __aetherisWorldIdReadiness?: CacheSlot };

function rpConfigured(): boolean {
  return optionalEnv('WORLD_ID_RP_ID') !== '' && optionalEnv('WORLD_ID_RP_SIGNING_KEY') !== '';
}

async function probeAction(
  appId: string,
  action: string,
): Promise<{ status: WorldIdActionStatus; detail: string }> {
  const base = optionalEnv('WORLD_ID_API_BASE', DEFAULT_API_BASE).replace(/\/+$/, '');
  // World ID 4.0: actions are scoped to the relying party, so probe the v4 verifier.
  // Without an RP id we cannot ask v4 anything meaningful — report that instead.
  const rpId = optionalEnv('WORLD_ID_RP_ID');
  const url = rpId
    ? `${base}/api/v4/verify/${encodeURIComponent(rpId)}`
    : `${base}/api/v2/verify/${encodeURIComponent(appId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        rpId
          ? {
              // Minimal, deliberately invalid World ID 4.0 result: enough structure for the
              // verifier to resolve app + action and reject the proof itself.
              protocol_version: '4.0',
              nonce: '0x1',
              action,
              environment: 'production',
              responses: [
                {
                  identifier: 'proof_of_human',
                  signal_hash: '0x0',
                  proof: ['0x1', '0x2', '0x3', '0x4', '0x5'],
                  nullifier: '0x1',
                  issuer_schema_id: 1,
                  expires_at_min: 1756166400,
                },
              ],
              user_presence_completed: false,
            }
          : {
              nullifier_hash: '0x1',
              merkle_root: '0x1',
              proof: '0x1',
              verification_level: 'orb',
              action,
              signal_hash: '0x0',
            },
      ),
      cache: 'no-store',
      signal: controller.signal,
    });
    let body: { code?: string; detail?: string } = {};
    try {
      body = (await response.json()) as { code?: string; detail?: string };
    } catch {
      body = {};
    }
    const code = body.code ?? '';
    if (response.status === 404 || code === 'not_found') {
      return {
        status: 'app-not-found',
        detail: `World ID Developer Portal does not know app ${appId}: ${body.detail ?? 'not found'}.`,
      };
    }
    if (code === 'invalid_action' || /action not found/i.test(body.detail ?? '')) {
      return {
        status: 'action-missing',
        detail: `World ID app ${appId} exists, but action "${action}" is not registered in the Developer Portal (verifier: "${body.detail ?? code}"). Create it under the app's Actions tab — until then every proof is rejected and no operator can be relayed on-chain.`,
      };
    }
    if (response.status >= 400 && response.status < 500) {
      // Any other 4xx (invalid_proof, invalid_merkle_root, …) means app AND action resolved.
      return { status: 'ok', detail: '' };
    }
    return {
      status: 'unknown',
      detail: `World ID verifier answered HTTP ${response.status} (${code || 'no code'}) to the readiness probe.`,
    };
  } catch (cause) {
    return {
      status: 'unknown',
      detail: `World ID verifier unreachable at ${url}: ${cause instanceof Error ? cause.message : String(cause)}.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe (cached 60 s) whether a real World ID proof could be verified and relayed.
 * Never throws — an unreachable verifier is reported as `actionStatus: 'unknown'`.
 */
export async function probeWorldIdReadiness(): Promise<WorldIdReadiness> {
  assertServerOnly('lib/worldid-status.ts#probeWorldIdReadiness');
  const appId = optionalEnv('NEXT_PUBLIC_WORLD_ID_APP_ID').trim();
  const action = optionalEnv('NEXT_PUBLIC_WORLD_ID_ACTION', 'aetheris-operator').trim();
  const rp = rpConfigured();
  const key = `${appId}|${action}|${rp ? 1 : 0}`;

  const cached = store.__aetherisWorldIdReadiness;
  if (cached && cached.key === key && Date.now() - cached.value.checkedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  const appIdValid = APP_ID_RE.test(appId);
  let actionStatus: WorldIdActionStatus;
  let detail: string;
  if (!appIdValid) {
    actionStatus = 'unconfigured';
    detail = 'NEXT_PUBLIC_WORLD_ID_APP_ID is empty or malformed — World ID proofs cannot be verified on this server.';
  } else {
    ({ status: actionStatus, detail } = await probeAction(appId, action));
  }

  const gaps: string[] = [];
  if (detail !== '') gaps.push(detail);
  if (!rp) {
    gaps.push(
      'WORLD_ID_RP_ID / WORLD_ID_RP_SIGNING_KEY are missing, so IDKit cannot open a proof request (the gate falls back to a labelled simulation).',
    );
  }

  const value: WorldIdReadiness = {
    appId,
    action,
    appIdValid,
    rpConfigured: rp,
    actionStatus,
    relayable: actionStatus === 'ok' && rp,
    detail: gaps.join(' '),
    checkedAt: Date.now(),
  };
  store.__aetherisWorldIdReadiness = { key, value };
  return value;
}
