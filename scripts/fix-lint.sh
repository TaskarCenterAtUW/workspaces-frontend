#!/usr/bin/env bash
#
# Autofix lint/formatting errors in the working tree.
#
# Runs ESLint's `--fix` (exposed as `npm run lint:fix`), which rewrites files
# in place to resolve the auto-fixable subset of lint errors (semicolons,
# trailing commas, import order, etc.). Errors ESLint can't fix automatically
# are still reported and need manual fixes.
#
# Usage:
#   scripts/fix-lint.sh
#
# Run from anywhere; it cd's to the repo root.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> ESLint --fix"
npm run lint:fix
eslint_status=$?

echo ""
if [[ $eslint_status -eq 0 ]]; then
  echo "==> Autofix complete. Remaining errors (if any) need manual fixes."
else
  echo "==> ESLint reported errors it could not autofix — run 'npm run lint' to see them."
fi

exit $eslint_status
