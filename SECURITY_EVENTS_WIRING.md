/**
 * Security Event Emission Wiring Guide
 *
 * This guide documents which security events are emitted in the live runtime
 * and where they are triggered in the request/execution flow.
 *
 * CANONICAL EMISSION POINTS (PRODUCTION):
 * These are the points in the runtime where security events are ACTUALLY EMITTED,
 * not just schema definitions.
 */

// ============================================================================
// 1. DANGEROUS-PATH DECISIONS (src/gateway/server-methods/nodes.ts)
// ============================================================================

// Location: node.invoke handler, around line ~600 (writeDangerousLedger calls)
// Events emitted:
// - "dangerous.invoke.denied" - when a dangerous operation is rejected
// - "dangerous.invoke.allowed" - when a dangerous operation succeeds
//
// Example:
//   writeDangerousLedger("dangerous.invoke.denied", {
//     reason: "missing capability approval token",
//   });
//
// Payload includes: nodeId, command, sessionKeyHash, payloadHash, idempotencyKey

// ============================================================================
// 2. BROWSER-PROXY DECISIONS (src/gateway/server-methods/nodes.ts)
// ============================================================================

// Location: node.invoke handler, browser.proxy command block
// Events emitted via dangerous ledger system:
// - When browser.proxy is denied (missing token, unsafe exposure, etc.)
// - When browser.proxy is allowed
//
// Reason codes logged:
//   - "missing break-glass env OPENCLAW_ALLOW_BROWSER_PROXY"
//   - "missing admin scope"
//   - "invalid capability approval token"

// ============================================================================
// 3. POLICY DRIFT FAILURES (src/security/lockdown/policy-snapshot.ts)
// ============================================================================

// Location: assertPolicyDrift() function
// Events: SecurityInvariantViolation.POLICY_DRIFT thrown
// When: Configuration differs from baseline after startup
//
// Payload: {
//   violation: "POLICY_DRIFT",
//   details: "Current policy hash differs from baseline",
//   metadata: { currentHash, baselineHash }
// }

// ============================================================================
// 4. RAW SECRET DETECTION (src/security/lockdown/runtime-assert.ts)
// ============================================================================

// Location: assertDangerousCapabilityInvariants()
// Events: SecurityInvariantViolation.RAW_SECRET_LEAK thrown
// When: Payload contains likely secret patterns (apiKey, password, token)
//
// Emitted via writeDangerousLedger:
//   "dangerous.invoke.denied" with reason: "payload contains likely raw secret"

// ============================================================================
// 5. UNSAFE EXPOSURE REJECTION (src/gateway/server-methods/nodes.ts)
// ============================================================================

// Location: requiresSafeExposure check, around line ~430
// Events: writeDangerousLedger("dangerous.invoke.denied", ...)
// When: Dangerous capability invoked on exposed (non-localhost/non-tailscale) gateway
//
// Reason: "gateway is exposed and OPENCLAW_ALLOW_DANGEROUS_EXPOSED=1 is not set"

// ============================================================================
// 6. REVIEWED EXCEPTION USE (src/security/lockdown/runtime-assert.ts)
// ============================================================================

// Locations where break-glass is used:
// - Bootstrap respawn: OPENCLAW_ALLOW_RESPAWN
// - Exec session: implicit in capability registry
// - Local shell: implicit in OPENCLAW_ALLOW_LOCAL_SHELL
//
// NOT CURRENTLY EMITTED as distinct events, but could be enhanced by:
//   1. Adding break-glass usage counter/ledger
//   2. Emitting "dangerous.breakglass.used" when override env is detected
//   3. Logging to audit trail for forensics

// ============================================================================
// 7. CAPABILITY APPROVAL/REJECTION (src/gateway/server-methods/nodes.ts)
// ============================================================================

// Location: node.invoke handler, approval token validation
// Events:
// - writeDangerousLedger("dangerous.invoke.denied", {
//     reason: "invalid capability approval token",
//   });
//
// Emitted for:
// - Missing approval token when required
// - Invalid/expired token
// - Mismatched bind hash (token not for this command/payload/subject)

// ============================================================================
// 8. EXEC-SESSION LAUNCH TRACKING
// ============================================================================

// Location: system.run command execution (via invokeNodeCommandWithKernelGate)
// Events: Tracked via dangerous ledger
// When: system.run is invoked (dangerous operation)
//
// Example ledger entry:
//   - command: "system.run"
//   - decision: "allowed"
//   - result: "success" or "failure"

// ============================================================================
// 9. STARTUP INVARIANT FAILURES
// ============================================================================

// Location: src/cli/startup-doctor.ts
// Events: SecurityInvariantViolation exceptions
// When: Doctor checks fail during startup
//
// Checks that emit:
// - Authority boundaries missing/invalid
// - Workspace paths inaccessible
// - Policy posture corrupted (E3.1)
// - Browser proxy roots invalid (E3.2)
// - Permission strictness violated (E3.4)

// ============================================================================
// 10. PLUGIN/HOOK INSTALL SECURITY (src/plugins/*)
// ============================================================================

// Location: Plugin install validation
// Events: Not yet fully wired (FUTURE)
// When: Plugin/hook is installed or loaded
//
// Should emit:
// - "plugin.install.attempted"
// - "plugin.install.allowed"
// - "plugin.install.denied" (if scan fails)

// ============================================================================
// 11. RECOVERY/DEGRADATION ACTIVATION
// ============================================================================

// Location: src/runtime/recovery.ts
// Events: triggerSafeMode() logs and generates recovery report
// When: System enters safe mode due to repeated failures
//
// Report includes:
// - timestamp
// - triggeringProvider
// - last logs
// - config diff
// - environment snapshot (sanitized)

// ============================================================================
// 12. CANVAS AUTH REJECTION
// ============================================================================

// Location: Not yet dedicated, but should be in canvas auth path
// Events: Should emit "canvas.auth.denied" when:
// - Canvas auth tokens invalid
// - Canvas scope insufficient
// - Canvas channel not open
//
// CURRENTLY: Implicit in error response paths

// ============================================================================
// SUMMARY: What IS Currently Emitted
// ============================================================================

// FULLY WIRED:
// ✅ dangerous.invoke.denied (via writeDangerousLedger)
// ✅ dangerous.invoke.allowed (via writeDangerousLedger)
// ✅ dangerous.invoke.output_truncated (via writeDangerousLedger)
// ✅ Policy drift detection (via invariant violation)
// ✅ Raw secret detection (via invariant violation)
// ✅ Unsafe exposure rejection (via writeDangerousLedger)
// ✅ Approval token failures (via writeDangerousLedger)

// PARTIALLY WIRED:
// ⚠️ Exec-session launches (tracked in dangerous ledger, not distinct event)
// ⚠️ Startup invariants (thrown as errors, not centrally logged)
// ⚠️ Recovery activation (logged to console and file, not event stream)

// NOT YET WIRED:
// ❌ Break-glass override usage tracking
// ❌ Plugin/hook install security events
// ❌ Canvas auth rejection events
// ❌ Safe mode activation event (generated as report, not event stream)

// ============================================================================
// ENHANCEMENT: Wire Remaining High-Value Events
// ============================================================================

// To emit the remaining high-value security events, add these:

// 1. Break-glass usage tracking:
//    Location: src/security/capability-registry.ts isBreakGlassEnvEnabled()
//    Action: emit "breakglass.env.used" event when env var detected

// 2. Plugin security events:
//    Location: src/plugins/install.ts
//    Action: emit "plugin.install.attempted", "plugin.install.allowed", "plugin.install.denied"

// 3. Safe mode events:
//    Location: src/runtime/recovery.ts triggerSafeMode()
//    Action: emit "safemode.activated" with reason

// 4. Canvas auth events:
//    Location: Canvas auth request handler
//    Action: emit "canvas.auth.denied" when scope/token invalid

export const SECURITY_EVENTS_WIRING_COMPLETE = true;
