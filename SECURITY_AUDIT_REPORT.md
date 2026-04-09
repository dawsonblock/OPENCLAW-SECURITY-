# OpenClaw Security Hardening Analysis Report

**Date:** Feb 15, 2026 (updated Apr 3, 2026)
**Target:** `OPENCLAW-SECURITY` Fork
**Scope:** Comprehensive Source Code Audit & Security Architecture Review

## Executive Summary

This is the active security hardening-status document for the repository. Older narrative reports are archived under `docs/archive/` and should not be treated as current status.

The `OPENCLAW-SECURITY` codebase contains a substantial defense-in-depth security architecture centered on a kernel-like **RFSN (Request For Side-effect Negotiation)** arbitration layer. The RFSN spine is real, and the reviewed execution authorities are now described explicitly instead of being compressed into a single seam:

- `src/security/subprocess.ts`: bounded general runtime subprocess authority
- `src/process/spawn-utils.ts`: dedicated exec-session spawn authority for shell-backed and Docker exec sessions
- `src/entry.ts`: bootstrap-only respawn exception before normal runtime routing exists
- `src/tui/tui-local-shell.ts`: local-TUI-only unbounded shell exception

**However, the original version of this report overstated completeness.** A follow-up code audit identified several concrete gaps between the architecture's intent and the live code:

| Finding                                                           | File                         | Fixed                                                   |
| ----------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------- |
| `verifySignature()` was a stub that accepted any non-empty string | `src/runtime/updater.ts`     | ✅ Apr 2026 (file subsequently removed — see Blocker 4) |
| `shell: true` bypass in local TUI runner                          | `src/tui/tui-local-shell.ts` | ✅ Apr 2026                                             |
| `execFileSync("openclaw", ...)` in repair command bypassed RFSN   | `src/cli/commands/repair.ts` | ✅ Apr 2026                                             |
| Unused `execSync` import leaked dead authority path               | `src/cli/commands/up.ts`     | ✅ Apr 2026                                             |

The RFSN architecture, subprocess allowlisting, ledger append, and secret redaction are structurally intact. The gaps above have been patched. The reviewed execution-authority exceptions now live in `src/security/authority-boundaries.ts`, and both CI plus the structural boundary tests now consume the same shared authority-boundary model and importer-scan helper. That enforcement is scoped to the reviewed server-side TypeScript runtime roots in `src/` and `extensions/`; it is not presented as whole-repository proof over native apps, browser UI code, or compatibility wrapper packages.

## Detailed Phase Analysis

### Phase 0: Bounded General Subprocess Sandboxing (`src/security/subprocess.ts`)

- **Status:** ✅ **Verified Robust**
- **Mechanism:** Bounded general-purpose replacement for runtime `child_process` usage.
- **Key Defenses:**
  - **Strict Allowlists:** Only explicitly permitted binaries (e.g., `git`, `ls`) can be executed.
  - **Path Traversal Prevention:** Blocks absolute paths and slashes in command names to prevent executing arbitrary binaries.
  - **Environment Scrubbing:** Whitelists allowed environment variables (e.g., `PATH`, `HOME`), aggressively stripping dangerous ones like `NODE_OPTIONS`, `LD_PRELOAD`.
  - **Resource Caps:** Enforces hard timeouts and stdout/stderr byte limits (1MB default) to prevent DoS.
- **Status update:** the dead `src/runtime/supervisor.ts` exception has been removed from the live tree.

### Phase 0b: Reviewed Exec-Session Spawn Seam (`src/process/spawn-utils.ts`)

- **Status:** ✅ **Reviewed Narrow Exception**
- **Mechanism:** Low-level launcher used only by the exec subsystem for shell-backed exec sessions and Docker exec sessions.
- **Scope note:** This is not the general runtime subprocess seam. It exists because the exec subsystem needs raw child-process handles for interactive sessions.
- **Reachability:** Structural tests and CI pin the runtime importer set to `src/process/exec.ts` and `src/agents/bash-tools.exec.runtime.ts`, and the shared importer-boundary scan covers the reviewed server-side TypeScript runtime roots in `src/` and `extensions/`. `apps/` stays out of scope for this check because it is native code, while `packages/` stays out of scope because it contains JavaScript compatibility shims rather than the reviewed TypeScript runtime roots.

### Phase 1: RFSN Policy Engine (`src/rfsn/policy.ts`)

- **Status:** ✅ **Verified Comprehensive**
- **Mechanism:** Capability-based access control (CBAC) configuration.
- **Key Defenses:**
  - **Granular Permissions:** Defines specific capabilities (e.g., `fs:read:workspace`, `net:outbound:google.com`).
  - **Risk Grading:** Assigns risk levels (`low`, `medium`, `high`) to tools. High-risk tools (exec, browser) require explicit capabilities.
  - **Env Overrides:** Allows runtime configuration via `OPENCLAW_RFSN_*` variables without code changes.

### Phase 2: Secret Redaction (`src/rfsn/redact.ts`)

- **Status:** ✅ **Verified Effective**
- **Mechanism:** Recursive object traversal and regex pattern matching.
- **Key Defenses:**
  - **Broad Pattern Matching:** Detects standard formats (sk-_, gh_, xox\*) and heuristic keywords (token, secret, password).
  - **Deep Scrubbing:** Recursively scrubs objects and arrays up to a safe depth (8 levels) to prevent circular reference crashes or DoS.
  - **Ledger Safety:** Ensures sensitive data is redacted _before_ being written to permanent audit logs.

### Phase 3: Network & Provider Hardening (`src/security/provider-remote.ts`, `network-egress-policy.ts`)

- **Status:** ✅ **Verified Strict**
- **Mechanism:** URL validation and egress policy enforcement.
- **Key Defenses:**
  - **SSRF Protection:** Explicitly blocks private IP ranges (`127.0.0.0/8`, `10.0.0.0/8`, `192.168.0.0/16`, `169.254.0.0/16`).
  - **DNS Rebinding Defense:** Validates hostnames resolve to public IPs before connection.
  - **Header Sanitization:** Strips dangerous headers (`Authorization`, `Cookie`, `Host`) from user-supplied inputs to prevent session hijacking.

### Phase 4: RFSN Gate & Dispatch (`src/rfsn/gate.ts`, `dispatch.ts`)

- **Status:** ✅ **Verified Integrity-Focused**
- **Mechanism:** Centralized arbitration kernel.
- **Key Defenses:**
  - **The "Gate":** A pure function that evaluates a proposal against the policy. It returns a decision object registered in a **module-private `WeakSet`** (`gateDecisionRegistry`). Because the WeakSet is not exported and cannot be reached from outside the module, no external code can add an object to it or forge a valid gate stamp.
  - **The "Dispatch":** The only path to tool execution. It verifies the Gate's stamp, logs the proposal and decision to the tamper-evident ledger, and then executes the tool only if permitted.
  - **Double-Wrap Prevention:** Detects and rejects attempts to wrap an already-wrapped tool, preventing infinite recursion or logic bypasses.

### Phase 5: Self-Audit & Forensics (`src/security/posture.ts`, `audit-daemon.ts`)

- **Status:** ✅ **Verified — operator-triggered**
- **Mechanism:** Operator-triggered audit daemon and forensic data collection.
- **Key Defenses:**
  - **Posture Hashing:** Calculates a SHA-256 hash of the critical security configuration at startup.
  - **Drift Detection:** `AuditDaemon` runs periodically (default 60s) to re-calculate the hash. Any mismatch triggers a `CRITICAL` alert, detecting runtime tampering of config. The daemon is started explicitly via `openclaw security monitor`; it is not wired into the gateway startup path, so continuous monitoring requires the operator to start it.
  - **Forensic Bundling:** `exportIncidentBundle` gathers config, logs, and the cryptographic ledger into a zip file for post-incident analysis.

### Phase 6: Infrastructure Hardening (`src/infra/archive.ts`, `skill-scanner.ts`)

- **Status:** ✅ **Verified Defensive**
- **Mechanism:** Safe I/O and static analysis.
- **Key Defenses:**
  - **Zip Slip Prevention:** Explicitly checks that extracted file paths resolve within the target directory.
  - **Skill Scanning:** Scans plugin source code for dangerous patterns (exec, eval, obfuscation, crypto miners) before installation.
  - **Browser Auth Proxy:** A standalone proxy script ensures that CDP (Chrome DevTools Protocol) connections require Bearer token authentication, preventing unauthorized browser control.

### Phase 7: Lockdown Layer (`src/security/lockdown/`)

- **Status:** ✅ **Verified Hardened**
- **Mechanism:** Defense-in-depth assertions.
- **Key Defenses:**
  - **Runtime Assertions:** `assertDangerousCapabilityInvariants` checks permissions, exposure status, runtime policy drift, and resource limits _immediately_ before dangerous operations.
  - **Resource Governor:** Tracks concurrent dangerous operations to prevent resource exhaustion attacks.

## Code Quality & Engineering

The code quality is high in the security-focused modules.

- **Type Safety:** Strict TypeScript usage with Zod/TypeBox for validation.
- **Symbolic Security:** Extensive use of ES6 `Symbol`s to create unforgeable tokens within the runtime memory (for example, gate stamps on approved execution flows).
- **Immutability:** Usage of `Object.freeze` and read-only types to prevent state tampering.
- **Testing:** Security modules have co-located `*.test.ts` files; coverage of bypass paths (e.g., non-RFSN `child_process` sites) should be expanded.

## Conclusion

The RFSN spine and reviewed execution boundaries are real and structurally checked within the reviewed runtime roots. The bounded general subprocess seam, the narrower exec-session seam, the bootstrap-only respawn exception, and the local-TUI-only unbounded shell exception are now described separately and tested against drift.

**Recommendation:** Keep treating these execution boundaries as a live review surface. In particular, `src/tui/tui-local-shell.ts` remains outside the bounded runtime model, and `src/entry.ts` remains a bootstrap exception rather than a tool-execution path.
