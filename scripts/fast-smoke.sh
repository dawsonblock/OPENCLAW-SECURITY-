#!/bin/bash
set -eo pipefail
# cspell:ignore OPENCLAW vitest

echo "🛡️  Running fast runtime confidence pass..."

export OPENCLAW_SECURITY_EVENTS_ENABLED=1

pnpm exec vitest run \
  src/gateway/node-command-kernel-gate.runtime.test.ts \
  src/node-host/browser-containment.integration.test.ts \
  src/node-host/browser-proxy.test.ts \
  src/runtime/runtime-truth.smoke.test.ts

echo "✅ Fast smoke pass completed successfully."
