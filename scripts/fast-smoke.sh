#!/bin/bash
set -e

# OpenClaw Fast Smoke Test Suite
# Runs the essential runtime proofs for security boundaries and health.

echo "🚀 Starting OpenClaw Fast Smoke Suite..."

# 1. Authority Boundary Scan
echo "🔍 Checking authority boundaries..."
pnpm vitest run src/security/authority-boundaries.test.ts

# 2. Runtime Truth (Node Gating, Browser Containment, Health)
echo "🛡️ Verifying runtime security proofs..."
pnpm vitest run src/runtime/runtime-truth.smoke.test.ts

# 3. Startup Invariants
echo "🏗️ Validating startup invariants..."
pnpm vitest run src/security/invariant-validator.test.ts

echo "✅ Fast Smoke Suite passed!"
