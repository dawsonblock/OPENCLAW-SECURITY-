# OpenCLAW Operational Maturity Guide

## Overview

This document describes the current runtime proof surface, configuration requirements, and known limitations for the hardened gateway branch. It is intentionally narrower than earlier maturity drafts: helper schemas and placeholder surfaces are not treated as live operator guarantees unless the runtime wiring and tests prove them.

## What is Proven

### Structural Proof (Static Analysis)

The following are proven through static code analysis and CI validation:

- **Authority Boundaries**: Import graph analysis verifies that dangerous subprocess operations are routed through reviewed entry points (`subprocess.ts`, `spawn-utils.ts`, `tui-local-shell.ts`, `entry.ts`).
  - Scan scope: `src/` and `extensions/` only
  - Forbidden roots: `src/gateway/`, `src/node-host/`, `src/rfsn/`, `src/agents/tools/`
  - Run validation: `pnpm security:check`

- **Policy Enforcement Model**: RFSN gate (`src/rfsn/`) enforces dangerous capability checks before tool execution.
  - Capabilities required for exec, browser, web_fetch, etc. are defined and enforced
  - Policy drift detection via posture hashing
  - Dangerous action limiter prevents rapid repeated attempts

- **Local Shell Isolation**: Import analysis confirms `tui-local-shell.ts` is only imported from TUI surface (`src/tui/tui.ts`).
  - Feature is disabled by default (requires `OPENCLAW_LOCAL_SHELL_ENABLED=1` AND `OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED=1`)
  - Cannot be triggered by remote message input or agent output

- **Reviewed Exception Boundaries**: Four explicit exception paths are reviewed and bounded:
  1. `src/security/subprocess.ts`: Subprocess invocation for bounded commands
  2. `src/process/spawn-utils.ts`: Exec session seam with command filtering
  3. `src/tui/tui-local-shell.ts`: Intentional TUI-only unbounded shell
  4. `src/entry.ts`: Bootstrap-only respawn exception

### Runtime Proof

The following are validated through runtime integration tests:

- **Dangerous-Path Gate Enforcement** (`src/rfsn/runtime-gate-integration.test.ts`, `src/gateway/node-command-kernel-gate.runtime.test.ts`):
  - High-risk exec flow is blocked when policy or safe mode forbids it
  - Allowed commands execute successfully only under the reviewed conditions
  - Missing required capabilities block execution even if a command is allowlisted
  - Dangerous-path allow/deny events are emitted on the live RFSN dispatch path

- **Local-Shell Isolation** (`src/tui/tui-local-shell.integration.test.ts`):
  - Shell execution blocked when `OPENCLAW_LOCAL_SHELL_ENABLED` is not set
  - Shell execution blocked without `OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED`
  - Per-session user consent is enforced before execution
  - Remote input, gateway messages, and agent output cannot trigger shell
  - Feature disabled by default; enabled only with explicit env flags + user consent

- **Browser Path Containment** (`src/node-host/browser-proxy.runtime.test.ts`, `src/node-host/browser-containment.integration.test.ts`):
  - In-root file access succeeds through the live browser-proxy seam
  - Outside-root access and symlink escapes are rejected at the live containment boundary

- **Canonical Health / Safe Mode Scope** (`src/runtime/runtime-truth.smoke.test.ts`, `src/runtime/safe-mode.behavior.test.ts`, `src/commands/health.test.ts`):
  - Canonical health is the gateway method/RPC path used by `openclaw health` and `status --deep`
  - Safe mode is surfaced in the health payload
  - Safe mode forces loopback bind, clears explicit host override, denies dangerous node commands, and disables insecure control-UI auth bypasses

### Fast Confidence Coverage

Quick operational validation points (run: `pnpm exec vitest run src/runtime/runtime-truth.smoke.test.ts`):

- Gateway starts with sane config
- Startup invariants pass in normal hardened configuration
- Authority-boundary structural integrity
- Browser-proxy rejects outside-root access through the live boundary
- Canonical health payload returns runtime-ready fields
- Dangerous-path gate enforcement is active
- Safe-mode guarantees match the documented scope
- Recovery fallback remains lightweight and bounded

## What Requires Configuration

The following security properties depend on operator configuration:

### Critical (Must Configure)

1. **Gateway Auth**
   - Local mode: Set `OPENCLAW_GATEWAY_TOKEN` or configure `gateway.auth.token` in config
   - Remote mode: Set `gateway.remote.url` and configure authentication
   - Verify: `openclaw doctor` will warn if auth is missing

2. **Gateway Binding**
   - `gateway.mode`: Set to `"local"` (loopback only) or `"remote"` (with careful exposure)
   - `gateway.bind`: Control binding address (loopback, lan, tailnet, or explicit host)
   - Dangerous node commands (exec, run) are blocked unless binding is loopback or safe-mode overridden
   - Verify: Check `gateway.bind` and `gateway.mode` match your deployment model

3. **Workspace Paths**
   - Ensure `workspace.root` (or default `~/.openclaw`) is readable/writable with sane permissions
   - Agent data, memory, and forensic artifacts are stored here
   - Verify: `ls -la ~/.openclaw` for typical permissions

### Recommended (Should Configure)

1. **Policy Constraints**
   - Enable RFSN allowlist mode (default): `OPENCLAW_RFSN_MODE=allowlist`
   - Restrict exec whitelist: `OPENCLAW_RFSN_EXEC_SAFE_BINS=cat,echo,grep`
   - Restrict network domains: `OPENCLAW_RFSN_FETCH_ALLOW_DOMAINS=openai.com,api.anthropic.com`
   - Verify: Run `pnpm security:check` after configuration

2. **Audit Logging**
   - Enable security events: Keep `OPENCLAW_SECURITY_EVENTS_ENABLED=1` (default)
   - Configure log rotation: Set `logging.file` to a dated path (default: `/tmp/openclaw/openclaw-YYYY-MM-DD.log`)
   - Monitor the event types that are live-wired on this branch: `dangerous-path-denied`, `dangerous-path-allowed`, `browser-proxy-rejected`, `gateway-startup-invariant-failed`
   - Verify: Check `/tmp/openclaw/openclaw-*.log` for structured JSON events

3. **Browser Features (if enabled)**
   - Set `browser.enabled: true` and `browser.proxyPort: 18790`
   - Proxy rejects file access outside authorized roots
   - Verify: `openclaw doctor` checks proxy configuration

4. **Plugin/Extension System (if using)**
   - Set `plugins.enabled: true` and `extensions.enabled: true`
   - Configure scan roots: `extensions.roots: ["/path/to/plugins"]`
   - Plugins are scanned for dangerous patterns at startup
   - Verify: `openclaw doctor` lists loaded plugins

## What is Optional / Degraded

### Optional Subsystems

These subsystems are disabled by default and can fail independently:

1. **Browser Control** (disabled by default)
   - Requires: `browser.enabled: true`, `browser.proxyPort` set
   - If unavailable: Browser tool fails with clear error; gateway continues

2. **Forensics Anchor** (optional ledger binding)
   - Ties ledger tips to external anchor (e.g., blockchain)
   - If unavailable: Forensic audit trail still local; external binding skipped
   - Risk: Ledger is less tamper-evident without anchor

3. **Background Audit Daemon** (optional continuous validation)
   - Periodically recalculates policy posture hash
   - If unavailable: Posture checked at startup only
   - Risk: Drift during operation goes undetected until restart

4. **Plugin Registry** (optional skill system)
   - If plugins.enabled is false: Skipped entirely
   - If load fails: Logged as warning; gateway continues with core tools

5. **Gmail Watcher** (optional hooks system)
   - Requires: `hooks.gmail.account`, `hooks.gmail.model`
   - If unavailable: Email hooks disabled; other features work

6. **Memory Backend** (optional embeddings + vector search)
   - If plugin unavailable: Memory tools unavailable; other tools work
   - Verify: Check `openclaw doctor` for memory plugin status

### Degraded Mode Behavior

The canonical gateway-method health payload indicates `"degraded"` when:
- One or more optional subsystems failed to initialize
- Background audit daemon is behind schedule
- Forensics anchor temporarily unavailable
- Extension load had non-fatal warnings

**Impact**: Reduced observability or optional features unavailable; core dangerous-path enforcement unaffected.

## Known Limitations

### Out of Scope (Not Proven)

1. **Multi-Node Deployment**: OpenCLAW v2026 is a single-host control plane.
   - Gateway runs on one machine
   - No distributed consensus or multi-instance failover
   - Not suitable for high-availability production yet

2. **Container/K8s Isolation**: Security boundaries are not enforced at OS level.
   - Rely on OS process isolation, file permissions, and namespace separation
   - Running in containers requires careful seccomp/selinux rules outside OpenCLAW's scope

3. **Persistent Audit Trail**: Forensic ledger is local JSON by default.
   - Use external anchor (`forensics.anchor.enabled`) for tamper-evidence
   - Ensure log files are protected with appropriate OS permissions

4. **Agent Isolation**: Multiple agents on same gateway share workspace.
   - Agent session isolation is logical, not OS-level
   - Shared workspace means one agent's workspace can access another's files
   - Mitigate by using separate workspace roots per agent or VM separation

5. **Denial-of-Service Hardening**: Rate limiting and quotas are application-level.
   - No OS-level qdisc or container limits configured by OpenCLAW
   - Configure external rate limiting (nginx, Tailscale, cloud LB) if needed

### Runtime Assumptions

1. **Local File Access**: Workspace and config assume local filesystem.
   - Symlinks followed without special handling
   - Network filesystems may have timing/consistency issues

2. **Process Signals**: Graceful shutdown relies on SIGTERM/SIGINT handling.
   - SIGKILL will terminate immediately without cleanup
   - Orchestrators: set terminationGracePeriodSeconds >= 10s

3. **Subprocess Limits**: Max 50 concurrent safe-bin executions (configurable).
   - Exhaust this limit → further requests fail with clear error
   - Not a hard OS limit; set `OPENCLAW_DANGEROUS_ACTION_LIMITER_MAX=N` to tune

4. **Model Provider Availability**: All configured agents need a reachable model provider.
   - Offline agents are degraded but don't crash gateway
   - Canonical health marks degraded subsystems and readiness blockers when appropriate

## Startup and Health

### Startup Flow

1. **Load Config**: Read from `~/.openclaw/openclaw.json` or config override
2. **Authority Boundary Check**: Verify importer scan scope is intact (if enabled)
3. **Startup Invariants**: Check gateway auth, workspace paths, permissions (see `cli/startup-doctor.ts`)
4. **Initialize Core**: Load plugins, start channels, initialize browser/memory backends
5. **Optional Sidecars**: Start Gmail watcher, forensics anchor, audit daemon
6. **Ready to Receive**: the canonical gateway-method health payload returns `ready`

### Canonical Health Model

The live health contract is the gateway method/RPC path consumed by `openclaw health` and `openclaw status --deep`. Helper HTTP health endpoint files are not treated as the canonical operator contract unless they are explicitly mounted by the running gateway.

**Liveness** (`alive`):
- Process is up and the gateway health method responds

**Readiness** (`ready`):
- Startup invariants passed
- Critical components initialized
- No blocking security issues
- Check: `openclaw health --json` → `.ready == true`

**Degraded** (`degraded`):
- One or more optional subsystems failed
- Readiness can still remain true
- Check: `openclaw health --json` → `.degraded == true`

**Safe Mode** (`safeMode`):
- Safe mode is active and the runtime is using the narrowed hardening profile
- Check: `openclaw health --json` → `.safeMode == true`

Example health response:
```json
{
  "status": "healthy",
  "alive": true,
  "ready": true,
  "degraded": false,
  "safeMode": false,
  "readinessBlockers": [],
  "degradedSubsystems": []
}
```

## Observability and Auditing

### Structured Security Events

Enable with `OPENCLAW_SECURITY_EVENTS_ENABLED=1` (default).

Events are emitted as JSON log lines in `/tmp/openclaw/openclaw-YYYY-MM-DD.log`:

```json
{
  "security_event": "dangerous-path-denied",
  "timestamp_ms": 1704067200000,
  "level": "warn",
  "tool_name": "exec",
  "decision": "denied",
  "reason": "tool not allowlisted"
}
```

Live event types on this branch:
- `dangerous-path-allowed`
- `dangerous-path-denied`
- `browser-proxy-rejected`
- `gateway-startup-invariant-failed`

The schema files define additional event types, but they should be treated as type inventory unless the runtime path is explicitly wired and tested.

### Forensic Ledger

Each tool execution writes to per-session ledger in `~/.openclaw/<sessionId>.ledger`:

Entries:
1. **proposal**: Tool and arguments (redacted)
2. **decision**: Gate verdict and reasons
3. **result**: Execution outcome and summary (optional, if capture enabled)

Use for post-incident analysis:
```bash
jq '.payload | select(.type=="decision") | select(.verdict=="allow")' ~/.openclaw/session-xyz.ledger
```

### Startup Doctor Report

Run before production deployment:
```bash
openclaw doctor
```

Output:
- Authority boundary config ✓ / ✗
- Scan scope roots readable
- Workspace paths valid
- Gateway auth configured
- Optional features status

Non-zero exit code if critical issues found.

## Deployment Checklist

- [ ] Gateway mode (local/remote) configured
- [ ] Gateway token/auth secret generated and distributed securely
- [ ] Workspace root path has correct permissions (755, owned by process user)
- [ ] Log directory configured and writable (defaults to `/tmp/openclaw`)
- [ ] `OPENCLAW_RFSN_MODE=allowlist` enabled
- [ ] Exec safe bins restricted to needed commands
- [ ] Network domain allowlist set if `web_fetch` is used
- [ ] Browser proxy configured if browser features needed
- [ ] Policy posture hash can be computed (`pnpm security:check`)
- [ ] Startup doctor passes (`openclaw doctor`)
- [ ] Fast runtime smoke passes (`pnpm exec vitest run src/runtime/runtime-truth.smoke.test.ts`)
- [ ] Canonical health method accessible and returns `ready`
- [ ] Structured security events flowing to logs
- [ ] Audit logs are collected and monitored

## Troubleshooting

### Gateway won't start

1. Check `openclaw doctor` output for critical issues
2. Verify `gateway.mode` is set (local or remote)
3. If local: Check loopback binding (default 127.0.0.1:18789)
4. If remote: Verify `gateway.remote.url` is reachable

### Authority boundary check fails

1. Verify `src/` and `extensions/` exist and are readable
2. Rebuild the project: `pnpm build`
3. Run `pnpm security:check` for detailed importer errors
4. Check that no dangerous imports exist in forbidden roots

### Local shell won't activate even with env flags

1. Confirm both env flags are set: `OPENCLAW_LOCAL_SHELL_ENABLED=1` AND `OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED=1`
2. In TUI, confirm user consent prompt appears and is approved
3. Check logs for "local shell: enabled for this session"

### Dangerous action denied unexpectedly

1. Check RFSN policy: `echo $OPENCLAW_RFSN_MODE` (should be "allowlist")
2. Check granted capabilities: `OPENCLAW_RFSN_GRANTED_CAPABILITIES`
3. Look for policy drift warning in logs: "policy-drift-detected"
4. Compute current policy hash: `pnpm security:check` shows expected hash
5. Check ledger for decision reason: `cat ~/.openclaw/<sessionId>.ledger | grep decision`

## Future Work

- [ ] Multi-node distributed control plane with consensus
- [ ] Container-native security boundaries (seccomp, selinux)
- [ ] Persistent encrypted audit log with tamper-detection
- [ ] Per-agent OS-level isolation (separate UID/GID)
- [ ] Rate limiting and quota enforcement
- [ ] Kubernetes operator for declarative deployment
- [ ] Performance profiling and optimization

## See Also

- [Security Audit Report](SECURITY_AUDIT_REPORT.md): Architecture and threat model
- [Hardening Completion Report](HARDENING_COMPLETION_REPORT.md): What was added and proven
- Source: Authority boundary definitions at `src/security/authority-boundaries.ts`
- Security events: `src/security/security-events.ts` and `src/security/security-events-emit.ts`
- Health model: `src/runtime/health-model.ts`
- Doctor report: `src/cli/startup-doctor.ts`
- Reliability patterns: `src/runtime/reliability-patterns.ts`
