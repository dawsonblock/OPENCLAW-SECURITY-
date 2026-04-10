# Comprehensive Audit Report

## Status

This file replaces an older maturity narrative that overstated several live operator contracts. It now serves as a compact current-state summary for the hardened branch.

## Current Branch Truth

- **Architecture**: the reviewed execution boundaries remain intact. This branch does not redesign the runtime, replace the exec subsystem, remove bootstrap respawn, or remove the local shell.
- **Authority-boundary governance**: structural enforcement remains scoped to the reviewed runtime roots in `src/` and `extensions/`.
- **Canonical health/status**: the live contract is the gateway method/RPC path used by `openclaw health` and `openclaw status --deep`. Helper HTTP health endpoint files are not presented as mounted runtime surfaces.
- **Safe mode**: the runtime-proof surface is intentionally narrow. `OPENCLAW_SAFE_MODE=1` forces loopback bind, clears explicit host override, denies dangerous node commands, disables insecure control-UI auth bypasses, and is surfaced in the canonical health payload.
- **Browser containment**: outside-root access is rejected through the live browser-proxy seam, including symlink escapes.
- **Security events**: schema coverage is broader than runtime wiring. The live-wired events on this branch are:
  - `dangerous-path-allowed`
  - `dangerous-path-denied`
  - `browser-proxy-rejected`
  - `gateway-startup-invariant-failed`
- **Recovery**: recovery remains a lightweight fallback helper. It triggers safe mode, restores a sibling `.bak` config when present, and writes a sanitized local report. It is not a full rollback or disaster-recovery subsystem.

## Runtime-Proven Validation Surfaces

- `pnpm security:check`
- `src/security/authority-boundaries.test.ts`
- `src/security/execution-authority-boundaries.test.ts`
- `src/gateway/node-command-kernel-gate.runtime.test.ts`
- `src/node-host/browser-proxy.runtime.test.ts`
- `src/node-host/browser-containment.integration.test.ts`
- `src/runtime/safe-mode.behavior.test.ts`
- `src/runtime/recovery.runtime.test.ts`
- `src/runtime/runtime-truth.smoke.test.ts`
- `src/commands/health.test.ts`
- `src/commands/health.command.coverage.test.ts`

## Notes

- Older references to `/health`, `/ready`, broad event coverage, or full rollback/restore semantics should be treated as stale unless the runtime wiring and tests are updated to prove them.
- Placeholder operational surfaces, including `scripts/benchmarks.sh`, are not maturity claims.
