#!/usr/bin/env bash
# Aetheris - run the self-hosted Graph indexer for Hedera testnet on a VPS.
#
#   curl -fsSL https://raw.githubusercontent.com/mrnetwork0001/Aetheris/main/deploy/vps-subgraph.sh | sudo bash
#
# What it does: installs Docker if missing, writes a compose stack (graph-node +
# IPFS + Postgres) pointed at the Hedera JSON-RPC relay, exposes ONLY the GraphQL
# port (8000) publicly - the admin (8020) and IPFS (5001) ports stay on
# localhost so nobody can redeploy over the subgraph. Deploy the subgraph from
# a laptop through an SSH tunnel:
#
#   ssh -N -L 8020:127.0.0.1:8020 -L 5001:127.0.0.1:5001 user@VPS &
#   npx graph create --node http://localhost:8020/ aetheris
#   npx graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 \
#       --version-label v0.0.1 aetheris subgraph/subgraph.yaml --output-dir subgraph/build
#
# GraphQL afterwards: http://VPS:8000/subgraphs/name/aetheris
set -euo pipefail
DIR=/opt/aetheris-subgraph
RPC="${HEDERA_TESTNET_RPC:-https://testnet.hashio.io/api}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[1/3] installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || { echo "docker compose plugin missing"; exit 1; }

echo "[2/3] writing $DIR/docker-compose.yml"
mkdir -p "$DIR/data/ipfs" "$DIR/data/postgres"
cat > "$DIR/docker-compose.yml" <<YAML
services:
  graph-node:
    image: graphprotocol/graph-node:latest
    restart: unless-stopped
    ports:
      - "8000:8000"            # GraphQL - public
      - "127.0.0.1:8020:8020"  # admin  - localhost only (deploy via SSH tunnel)
      - "127.0.0.1:8030:8030"  # indexing status - localhost only
    depends_on: [ipfs, postgres]
    environment:
      postgres_host: postgres
      postgres_user: graph-node
      postgres_pass: let-me-in
      postgres_db: graph-node
      ipfs: "ipfs:5001"
      ethereum: "hedera-testnet:${RPC}"
      GRAPH_ETHEREUM_GENESIS_BLOCK_NUMBER: 1
      GRAPH_LOG: info
  ipfs:
    image: ipfs/kubo:v0.29.0
    restart: unless-stopped
    ports:
      - "127.0.0.1:5001:5001"  # localhost only
    volumes: ["$DIR/data/ipfs:/data/ipfs"]
  postgres:
    image: postgres:14
    restart: unless-stopped
    command: ["postgres", "-cshared_preload_libraries=pg_stat_statements"]
    environment:
      POSTGRES_USER: graph-node
      POSTGRES_PASSWORD: let-me-in
      POSTGRES_DB: graph-node
      POSTGRES_INITDB_ARGS: "-E UTF8 --locale=C"
      PGDATA: /var/lib/postgresql/data/pgdata
    volumes: ["$DIR/data/postgres:/var/lib/postgresql/data"]
YAML

echo "[3/3] starting the stack"
cd "$DIR" && docker compose up -d
for i in $(seq 1 60); do curl -s -o /dev/null -m 2 http://127.0.0.1:8030/ && break; sleep 3; done
echo
echo "graph-node is up. Open port 8000 in your firewall (ufw allow 8000/tcp) and deploy the subgraph through an SSH tunnel - see the header of this script."
