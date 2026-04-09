# OpenCLAW Operator Quick Reference

## Health and Readiness

```bash
# Check if gateway is alive (responds to requests)
curl http://127.0.0.1:18789/health

# Check if gateway is ready to receive work
curl http://127.0.0.1:18789/ready

# Expected responses:
# /health: 200 OK with full status (liveness, readiness, security_posture, components, degraded_subsystems)
# /ready:  200 OK if ready, 503 if not ready
```

## Pre-Deployment Validation

```bash
# Run comprehensive startup checks
openclaw doctor

# Run focused smoke tests (operator confidence)
pnpm test src/cli/smoke-tests.test.ts --run

# Verify security boundaries are intact
pnpm security:check

# Check authority boundary for violations
pnpm test src/security/execution-authority-boundaries.test.ts --run
```

## Configuration Essentials

```bash
# Set gateway mode (required)
export OPENCLAW_GATEWAY_MODE=local  # or "remote"

# Set gateway token for local mode (recommended)
export OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32)

# Enable structured security events (default: enabled)
export OPENCLAW_SECURITY_EVENTS_ENABLED=1

# Configure RFSN policy enforcement (recommended: allowlist)
export OPENCLAW_RFSN_MODE=allowlist

# Restrict exec safe binaries (recommended)
export OPENCLAW_RFSN_EXEC_SAFE_BINS=cat,echo,grep,ls

# Restrict network domains for web_fetch (recommended)
export OPENCLAW_RFSN_FETCH_ALLOW_DOMAINS=openai.com,api.anthropic.com
```

## Observability

```bash
# Tail structured security events
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | jq '.security_event'

# Find all dangerous-path denials
jq 'select(.security_event | contains("denied"))' /tmp/openclaw/openclaw-*.log

# Find policy drift events
jq 'select(.security_event == "policy-drift-detected")' /tmp/openclaw/openclaw-*.log

# Find reviewed exception usage (exec, local-shell, bootstrap-respawn)
jq 'select(.security_event | contains("invoked") or contains("activated") or contains("respawn"))' /tmp/openclaw/openclaw-*.log

# View tool execution ledger
cat ~/.openclaw/<SESSION_ID>.ledger | jq '.payload | select(.type == "decision")'
```

## Troubleshooting

### Gateway Won't Start

```bash
# 1. Run doctor for detailed diagnostics
openclaw doctor

# 2. Check config is valid
cat ~/.openclaw/openclaw.json | jq .

# 3. Verify gateway mode is set
jq '.gateway.mode' ~/.openclaw/openclaw.json

# 4. Check logs for startup errors
tail -50 /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log
```

### Authority Boundary Check Fails

```bash
# 1. Rebuild the project
pnpm build

# 2. Run detailed security check
pnpm security:check

# 3. Check specific importer violations
pnpm test src/security/execution-authority-boundaries.test.ts --run
```

### Dangerous Action Denied Unexpectedly

```bash
# 1. Check RFSN mode
echo $OPENCLAW_RFSN_MODE  # Should be "allowlist"

# 2. Check granted capabilities
echo $OPENCLAW_RFSN_GRANTED_CAPABILITIES

# 3. Verify policy is valid
pnpm security:check  # Shows policy hash

# 4. Check ledger for decision reason
cat ~/.openclaw/<SESSION_ID>.ledger | jq '.payload | select(.type == "decision")'
```

### Local Shell Won't Activate

```bash
# 1. Verify both env flags are set
echo "SHELL_ENABLED=$OPENCLAW_LOCAL_SHELL_ENABLED"
echo "ACK_ENABLED=$OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED"

# Both must be "1"

# 2. Check logs for consent messages
grep "local shell" /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log

# 3. In TUI, confirm consent prompt appears and is approved
```

## Performance and Debugging

```bash
# Monitor health endpoint updates
watch -n 1 'curl -s http://127.0.0.1:18789/health | jq .status'

# Check if subsystems are degraded
curl -s http://127.0.0.1:18789/health | jq .degraded_subsystems

# Find slow operations in logs
jq 'select(.elapsed_ms > 5000)' /tmp/openclaw/openclaw-*.log

# Count security events by type
jq -s 'group_by(.security_event) | map({type: .[0].security_event, count: length})' /tmp/openclaw/openclaw-*.log
```

## Safe Defaults

```
Gateway Mode:           local (loopback only)
RFSN Mode:             allowlist (allow only specified tools)
Security Events:       enabled (structured JSON logging)
Log Rotation:          daily (automatic by date in filename)
Browser:               disabled (enable only if needed)
Plugins:               disabled (enable only if needed)
Local Shell:           disabled (requires explicit env flags + consent)
Safe Mode:             disabled (restricts dangerous features if enabled)
```

## Common Scenarios

### Deploy to Production with Conservative Config

```bash
# 1. Generate gateway token
export OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32)

# 2. Configure security policy
export OPENCLAW_RFSN_MODE=allowlist
export OPENCLAW_RFSN_EXEC_SAFE_BINS=cat,echo,grep
export OPENCLAW_RFSN_FETCH_ALLOW_DOMAINS=api.openai.com,api.anthropic.com

# 3. Verify startup
openclaw doctor

# 4. Run smoke tests
pnpm test src/cli/smoke-tests.test.ts --run

# 5. Check authority boundaries
pnpm security:check

# 6. Start gateway
openclaw gateway start

# 7. Monitor health
watch -n 1 'curl -s http://127.0.0.1:18789/health | jq .status'
```

### Enable Browser Features Safely

```bash
# 1. Check browser prerequisites
openclaw doctor

# 2. Configure proxy port
export OPENCLAW_BROWSER_PROXY_PORT=18790

# 3. Set browser safe roots (where files can be accessed)
export OPENCLAW_BROWSER_SAFE_ROOTS=/home/user/documents

# 4. Restart gateway
openclaw gateway restart

# 5. Monitor browser rejections in logs
jq 'select(.security_event == "browser-proxy-rejected")' /tmp/openclaw/openclaw-*.log
```

### Debug Policy Drift

```bash
# 1. Check current policy hash
pnpm security:check

# 2. Look for drift detection events
jq 'select(.security_event == "policy-drift-detected")' /tmp/openclaw/openclaw-*.log

# 3. Verify config file hash matches expected
sha256sum ~/.openclaw/openclaw.json

# 4. If hash doesn't match, rebuild from known-good state
git checkout ~/.openclaw/openclaw.json
pnpm security:check
```

## Monitoring Checklist

- [ ] Health endpoint returns 200 OK
- [ ] `/ready` endpoint returns 200 if all systems initialized
- [ ] No degraded subsystems reported
- [ ] Security events flowing to logs (check timestamp)
- [ ] Authority boundary check passes (`pnpm security:check`)
- [ ] Doctor report shows "READY FOR OPERATION"
- [ ] No policy drift events in last 24h
- [ ] Dangerous-path decisions logged with reasons
- [ ] Workspace directory has correct permissions (755)
- [ ] Log rotation working (daily files in `/tmp/openclaw/`)

## See Also

- `OPERATIONAL_MATURITY_GUIDE.md`: Comprehensive operational documentation
- `OPERATIONAL_MATURITY_COMPLETION_REPORT.md`: What was added and why
- `SECURITY_AUDIT_REPORT.md`: Threat model and security architecture
- `src/security/authority-boundaries.ts`: Authority boundary definitions
- `src/runtime/health-model.ts`: Health model implementation
- `src/cli/startup-doctor.ts`: Doctor check implementations
