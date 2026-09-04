#!/usr/bin/env bash
# Runs the end-to-end suite against a disposable MySQL server in Docker.
#
#   npm run test:e2e            # up -> build -> test -> down
#   npm run test:e2e -- --keep  # leave the container running afterwards
#
# Two runs can share a machine by giving each its own Compose project and
# host port, so neither `down` tears down the other's container:
#
#   MQ_E2E_PROJECT=mq-e2e-b MQ_E2E_PORT=13307 npm run test:e2e
#
# Requires Docker with the Compose plugin.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE_FILE="docker/compose.yaml"
KEEP=0
MOCHA_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=1 ;;
    *) MOCHA_ARGS+=("$arg") ;;
  esac
done

if ! docker compose version >/dev/null 2>&1; then
  echo "error: docker compose is required to run the e2e suite" >&2
  exit 1
fi

cleanup() {
  if [ "$KEEP" -eq 0 ]; then
    echo "==> Stopping MySQL container"
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
  else
    echo "==> Leaving MySQL container up (--keep); stop it with: npm run e2e:down"
  fi
}
trap cleanup EXIT

echo "==> Starting MySQL on port ${MQ_E2E_PORT:-13306}"
docker compose -f "$COMPOSE_FILE" up -d --build --wait

echo "==> Building the CLI"
npm run build

echo "==> Running end-to-end tests"
# The +expansion guard keeps `set -u` happy with an empty array on bash 3.2.
npx mocha --forbid-only "test/e2e/**/*.e2e.test.ts" ${MOCHA_ARGS[@]+"${MOCHA_ARGS[@]}"}
