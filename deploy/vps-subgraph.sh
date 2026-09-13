#!/usr/bin/env bash
# Aetheris - self-hosted Graph indexer for Hedera testnet, designed for a SHARED server.
#
# Safety contract:
#   - Never installs or upgrades anything system-wide. Requires Docker + compose to
#     already exist (set INSTALL_DOCKER=1 to opt in to the official installer).
#   - Never touches other containers, services, firewall rules or ports. Runs as its
#     own compose project ("aetheris") in its own directory with its own volumes.
#   - Only binds ports that are FREE at start; aborts otherwise. Defaults avoid the
#     common 8000/8020/5001. Admin + IPFS bind to 127.0.0.1 only.
#   - `--check` performs read-only reconnaissance and changes nothing.
#
#   ./vps-subgraph.sh --check          # read-only: docker, ports, disk, memory
#   ./vps-subgraph.sh                  # start the stack (asks nothing else of the host)
#   ./vps-subgraph.sh --down           # stop and remove ONLY the aetheris containers
#
# Deploy the subgraph from a laptop through an SSH tunnel (admin is localhost-only):
#   ssh -N -L 8120:127.0.0.1:8120 -L 5101:127.0.0.1:5101 user@VPS &
#   npx graph create --node http://localhost:8120/ aetheris
#   npx graph deploy --node http://localhost:8120/ --ipfs http://localhost:5101 \
#       --version-label v0.0.1 aetheris subgraph/subgraph.yaml --output-dir subgraph/build
# GraphQL afterwards: http://VPS:${GRAPHQL_PORT}/subgraphs/name/aetheris
set -euo pipefail
PROJECT=aetheris
DIR="${AETHERIS_DIR:-$HOME/aetheris-subgraph}"
RPC="${HEDERA_TESTNET_RPC:-https://testnet.hashio.io/api}"
GRAPHQL_PORT="${GRAPHQL_PORT:-8100}"   # public
ADMIN_PORT="${ADMIN_PORT:-8120}"       # 127.0.0.1 only
STATUS_PORT="${STATUS_PORT:-8130}"     # 127.0.0.1 only
IPFS_PORT="${IPFS_PORT:-5101}"         # 127.0.0.1 only

port_in_use() { (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | awk '{print $4}' | grep -qE "[:.]$1\$"; }

recon() {
  echo "== read-only check =="
  command -v docker >/dev/null 2>&1 && echo "docker: $(docker --version)" || echo "docker: MISSING"
  docker compose version >/dev/null 2>&1 && echo "compose: $(docker compose version --short)" || echo "compose plugin: MISSING"
  echo "existing containers (untouched):"; docker ps --format '  {{.Names}}  {{.Ports}}' 2>/dev/null || echo "  (cannot list)"
  echo "listening ports:"; (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | awk 'NR>1{print "  "$4}' | sort -u | tr '\n' ' '; echo
  for p in "$GRAPHQL_PORT" "$ADMIN_PORT" "$STATUS_PORT" "$IPFS_PORT"; do port_in_use "$p" && echo "port $p: IN USE (would abort)" || echo "port $p: free"; done
  echo "disk: $(df -h / | awk 'NR==2{print $4" free of "$2}')   memory: $(free -h 2>/dev/null | awk '/Mem/{print $7" available of "$2}')"
  echo "aetheris dir: $DIR $([ -d "$DIR" ] && echo '(exists)' || echo '(will be created)')"
}

case "${1:-}" in
  --check) recon; exit 0 ;;
  --down) cd "$DIR" && docker compose -p "$PROJECT" down; exit 0 ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  if [ "${INSTALL_DOCKER:-0}" = "1" ]; then curl -fsSL https://get.docker.com | sh; else
    echo "Docker is not installed. Re-run with INSTALL_DOCKER=1 to opt in to the official installer, or install it yourself."; exit 1; fi
fi
docker compose version >/dev/null 2>&1 || { echo "docker compose plugin missing"; exit 1; }
for p in "$GRAPHQL_PORT" "$ADMIN_PORT" "$STATUS_PORT" "$IPFS_PORT"; do
  port_in_use "$p" && { echo "port $p is already in use on this host - aborting without changes. Override with GRAPHQL_PORT/ADMIN_PORT/STATUS_PORT/IPFS_PORT."; exit 1; }
done

mkdir -p "$DIR/data/ipfs" "$DIR/data/postgres"
cat > "$DIR/docker-compose.yml" <<YAML
name: ${PROJECT}
services:
  graph-node:
    image: graphprotocol/graph-node:v0.36.1
    restart: unless-stopped
    ports:
      - "${GRAPHQL_PORT}:8000"              # GraphQL - public
      - "127.0.0.1:${ADMIN_PORT}:8020"      # admin - localhost only
      - "127.0.0.1:${STATUS_PORT}:8030"     # indexing status - localhost only
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
      - "127.0.0.1:${IPFS_PORT}:5001"       # localhost only
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

cd "$DIR" && docker compose -p "$PROJECT" up -d
for i in $(seq 1 60); do curl -s -o /dev/null -m 2 "http://127.0.0.1:${STATUS_PORT}/" && break; sleep 3; done
echo
echo "aetheris stack is up (project '$PROJECT', dir $DIR). Nothing else on this host was touched."
echo "If a firewall blocks ${GRAPHQL_PORT}, allow it yourself (e.g. ufw allow ${GRAPHQL_PORT}/tcp) - this script never edits firewall rules."
