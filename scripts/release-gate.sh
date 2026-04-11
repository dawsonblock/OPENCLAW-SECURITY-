#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=========================================="
echo "    OPENCLAW CANONICAL RELEASE GATE       "
echo "=========================================="

echo "🔍 1. Running Dependency Hygiene Checks..."
node --import tsx scripts/deps-hygiene.ts

echo "🔍 2. Running Structural Security & Fast Smoke..."
./scripts/fast-smoke.sh

echo "🔍 3. Running Config Migration & Resource Failure Tests..."
pnpm test src/config/legacy.migrations.test.ts src/runtime/resource-failures.test.ts src/runtime/retention.test.ts

echo "🔍 4. Running Packaging & Release Sanity Checks..."
node --import tsx scripts/release-check.ts

echo "=========================================="
echo "✅ RELEASE GATE PASSED"
echo "=========================================="
