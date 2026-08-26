#!/usr/bin/env bash
# Enforce line caps on TypeScript/TSX source files.
# Source: 300 lines. Tests: 500 lines.
# Generated files (*.gen.*, *.generated.*), node_modules and dist are skipped.
#
# A file over the limit is a design signal, not a formatting nit: it almost
# always holds more than one responsibility. Split it along a natural seam
# instead of compressing lines or deleting comments to duck under.

set -euo pipefail

SOURCE_LIMIT=300
TEST_LIMIT=500

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
NC=$'\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

errors=0

while read -r lines file; do
  [[ "$file" == "total" || -z "$file" ]] && continue
  case "$file" in
    *.test.*|*.spec.*|*__tests__/*|*/tests/*) threshold=$TEST_LIMIT ;;
    *) threshold=$SOURCE_LIMIT ;;
  esac
  if [ "$lines" -gt "$threshold" ]; then
    echo "${RED}FAIL${NC} ${file#./} — ${lines} lines (limit: ${threshold})"
    errors=$((errors + 1))
  fi
done < <(
  find . -type f \( -name "*.ts" -o -name "*.tsx" \) \
    ! -path "*/node_modules/*" \
    ! -path "*/dist/*" \
    ! -path "*/.claude/*" \
    ! -path "./private/*" \
    ! -name "*.gen.ts" \
    ! -name "*.generated.ts" \
    -exec wc -l {} +
)

if [ "$errors" -gt 0 ]; then
  echo ""
  echo "${RED}${errors} file(s) exceed the line limit. Split them along a natural seam.${NC}"
  exit 1
fi

echo "${GREEN}All files within line limits${NC} (source: ${SOURCE_LIMIT}, tests: ${TEST_LIMIT})"
