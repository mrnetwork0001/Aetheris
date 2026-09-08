/**
 * Aetheris — typed environment access.
 *
 * Design rules enforced here:
 *  1. No environment variable is ever read at module-import time in a way that
 *     can throw. `next build` evaluates modules during prerender/type-collection,
 *     so an import-time throw would break the build on machines without secrets.
 *     Every "required" read happens lazily, inside the function that needs it.
 *  2. `NEXT_PUBLIC_*` variables must be referenced as *literal* `process.env.X`
 *     property accesses so the Next.js compiler can statically inline them into
 *     the client bundle. Dynamic lookups (`process.env[name]`) do NOT get inlined,
 *     which is why the public values below are hard-coded accessors.
 */

/** Thrown when a required environment variable is missing or blank at runtime. */
export class MissingEnvError extends Error {
  readonly name = 'MissingEnvError';
  readonly variable: string;

  constructor(variable: string, hint?: string) {
    super(
      `Missing required environment variable "${variable}".` +
        (hint ? ` ${hint}` : ' Add it to your .env.local (see .env.example).'),
    );
    this.variable = variable;
  }
}

/** Thrown when a server-only module is evaluated or invoked in a browser context. */
export class ServerOnlyViolationError extends Error {
  readonly name = 'ServerOnlyViolationError';

  constructor(moduleName: string) {
    super(
      `"${moduleName}" is server-only and must never run in the browser. ` +
        'Call it from a Route Handler, Server Action, or Server Component instead.',
    );
  }
}

/**
 * Read a server-side environment variable, throwing a named error if absent.
 * Never call this at module scope — only inside request-time functions.
 *
 * @param name - Process environment key (e.g. `ONEINCH_API_KEY`).
 * @param hint - Optional extra guidance appended to the error message.
 * @returns The trimmed, non-empty value.
 * @throws {MissingEnvError} When the variable is unset or empty.
 */
export function requireEnv(name: string, hint?: string): string {
  const raw = process.env[name];
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length === 0) throw new MissingEnvError(name, hint);
  return value;
}

/**
 * Read an optional server-side environment variable.
 *
 * @param name - Process environment key.
 * @param fallback - Value returned when the variable is unset or blank.
 * @returns The trimmed value, or `fallback`.
 */
export function optionalEnv(name: string, fallback = ''): string {
  const raw = process.env[name];
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value.length > 0 ? value : fallback;
}

/**
 * Guard that a server-only code path is not executing in a browser bundle.
 *
 * @param moduleName - Human-readable module label used in the error message.
 * @throws {ServerOnlyViolationError} When `window` is defined.
 */
export function assertServerOnly(moduleName: string): void {
  if (typeof window !== 'undefined') throw new ServerOnlyViolationError(moduleName);
}

/**
 * Public (browser-safe) configuration. Values are inlined at build time by Next.js
 * because each is a literal `process.env.NEXT_PUBLIC_*` access.
 *
 * Missing values fall back to safe defaults or empty strings so that importing this
 * module can never throw — callers that truly require a value should check for `''`.
 */
export const publicEnv = {
  worldIdAppId: process.env.NEXT_PUBLIC_WORLD_ID_APP_ID ?? '',
  worldIdAction: process.env.NEXT_PUBLIC_WORLD_ID_ACTION ?? 'aetheris-operator',
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '',
  subgraphUrl: process.env.NEXT_PUBLIC_SUBGRAPH_URL ?? '',
  ensRpcUrl: process.env.NEXT_PUBLIC_ENS_RPC_URL ?? 'https://eth.llamarpc.com',
  oneInchBaseUrl: process.env.NEXT_PUBLIC_ONEINCH_BASE_URL ?? 'https://api.1inch.dev',
  agencyAddress: process.env.NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS ?? '',
  treasuryAddress: process.env.NEXT_PUBLIC_AETHERIS_TREASURY_ADDRESS ?? '',
} as const;

/** Shape of {@link publicEnv}, useful for typing helpers that accept a config slice. */
export type PublicEnv = typeof publicEnv;
