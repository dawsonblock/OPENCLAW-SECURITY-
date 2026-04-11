# OpenClaw Threat Model

**Version:** 1.0 (Runtime Hardened)

This document establishes the exact execution boundary and threat model for the OpenClaw platform. It strips away aspirational claims to clarify precisely what the codebase protects, what it does not, and where operator responsibility begins.

## In-Scope Protections

1. **Dangerous Node Commands (Kernel Gate):**
   - The runtime intercepts and structurally denies generic, wide-open access requests for functions that can arbitrarily inspect the host environment or bypass sandbox protections, such as generic OS paths.
2. **Authority Boundaries (`src/security/authority-boundaries.ts`):**
   - Importers are statically scanned for compliance. Arbitrary remote code loading or unregistered privileged modules are strictly denied.
3. **Browser Root Containment:**
   - The embedded HTTP request proxy bounds web fetch operations to whitelisted roots (`src/node-host/browser-proxy.ts`). Requests to unapproved scopes or internal generic API bypasses are rejected.
4. **Safe-Mode Determinism:**
   - On unrecoverable error, the gateway predictably falls back. `Safe Mode` forces the router to bind ONLY to `loopback`, removes remote inbound webhook listener overrides, disables dangerous bypass auth, and creates a clear diagnostic artifact.
5. **Session Isolation (Subprocess seams):**
   - Executable sessions are handed over via `subprocess.ts`. This subsystem bounds general subprocess spawning.

## Out-of-Scope (Unprotected) Models

The following threat dimensions are explicitly **not protected by this application layer** and fall on the deployment topology or operator bounds:

1. **Host Orchestration Escapes (Docker/VM boundaries):**
   - OpenClaw is not a hypervisor. If deployed in a completely unprivileged or broad Linux namespace, we assume the environment protects other tenants.
2. **"Chaos Recovery" / Deep Snapshot Rollback:**
   - We do not magically clone block storage or restore corrupt database states. Our lightweight recovery merely captures logs, creates `.bak` of the final healthy JSON configuration, and enters Safe Mode.
3. **Local Unbounded Shells:**
   - OpenClaw *does* retain a local unbounded shell capability for explicitly acknowledged operator debugging. We assume physical access or direct SSH/root access equates to full compromise.

## Execution Exceptions

The runtime acknowledges necessary privileged seams that are excluded from typical sandbox gating to perform operational duties:

- **Bootstrap Respawn:** Hard reboot paths are naturally excluded.
- **Diagnostics:** Telemetry and safe logging.

## Extension Compatibility Boundaries

OpenClaw supports runtime extensions. However, we assume:
- Extension authors specify compat in `package.json` (`engines: { "openclaw": "..." }`). The runtime will warn on mismatches. 
- Extensions run within the same Node loop. Operators should only deploy trusted, tested extensions logic. Supply-chain poisoning of third-party extensions is out-of-bounds for the runtime execution gate.
