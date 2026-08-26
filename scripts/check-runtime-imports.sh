#!/usr/bin/env bash
# The runtime image is not the repo. Refuse an import that only exists in the repo.
#
# `Dockerfile` copies `dist`, `server.ts` and `server/` into the production stage and deliberately
# leaves `src` behind: the client is already built, and shipping the sources again would be dead
# weight. So anything the server imports out of `src/` resolves locally, typechecks, builds, passes
# every gate — and then throws `Cannot find module` on the first boot in production.
#
# That is exactly what happened once: a shared helper was put in `src/lib/picture.ts` and imported
# from `server/crm-routes.ts`. `bun run check` was clean, `vite build` was clean, the deploy went
# green, and the machine restart-looped until the logs were read. A rule the checker does not know
# about is a rule the next change walks straight through, so it is checked here.
#
# Code shared between the server and the client belongs under `server/` and is imported from `src/`,
# never the other way round.

set -euo pipefail

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
NC=$'\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# A relative hop into src/, or the `#/` subpath alias, from anything the runtime image ships.
hits=$(grep -rnE "from \"(\.\./)*src/|from \"#/" server.ts server/ 2>/dev/null || true)

if [ -n "$hits" ]; then
  echo "${RED}FAIL${NC} the server imports out of src/, which the runtime image does not copy:"
  echo "$hits"
  echo ""
  echo "${RED}Move the shared file under server/ and import it from src/ instead.${NC}"
  exit 1
fi

echo "${GREEN}No server imports reach into src/${NC}"
