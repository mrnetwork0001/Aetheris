/**
 * Optional peer dependencies that @privy-io/react-auth loads inside try/catch
 * for chains and connectors Aetheris does not use. They are not installed, so
 * webpack must be told to resolve them to nothing.
 *
 * NOTE: string externals do not work for scoped package names — webpack emits
 * `module.exports = @scope/name`, which is a syntax error. Aliasing to `false`
 * is the mechanism that actually works.
 */
const OPTIONAL_PRIVY_PEERS = [
  "@farcaster/mini-app-solana",
  "@abstract-foundation/agw-client",
  "@solana/kit",
  "@solana-program/system",
  "@solana-program/token",
  "@solana-program/memo",
  "permissionless",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(OPTIONAL_PRIVY_PEERS.map((pkg) => [pkg, false])),
    };
    return config;
  },
};

module.exports = nextConfig;
