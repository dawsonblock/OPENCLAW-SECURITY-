/**
 * Enhanced security events with correlation and latency tracking.
 *
 * E4.1: Added correlationId for tracing proposal→decision→result
 * E4.1: Added latency tracking for decision evaluation and execution
 */

export type SecurityEventType =
  | "dangerous-capability-denied"
  | "dangerous-capability-allowed"
  | "dangerous-path-denied"
  | "dangerous-path-allowed"
  | "policy-drift-detected"
  | "browser-proxy-rejected"
  | "canvas-auth-rejected"
  | "exec-session-invoked"
  | "local-shell-activated"
  | "bootstrap-respawn-event"
  | "plugin-scan-completed"
  | "authority-boundary-checked"
  | "reviewed-exception-used"
  | "dangerous-action-limiter-triggered"
  | "sandbox-startup-failure"
  | "sandbox-execution-failure"
  | "capability-grant-denied"
  | "policy-enforcement-degraded"
  | "gateway-startup-invariant-failed"
  | "gateway-startup-invariant-passed"
  | "tool-invocation-timeout"
  | "resource-limit-exceeded";

export type SecurityEventLevel = "critical" | "warning" | "info";

export interface SecurityEvent {
  type: SecurityEventType;
  timestamp: number; // Unix ms
  level: SecurityEventLevel;
  toolName?: string;
  action?: string;
  sessionId?: string; // stable, redacted session identifier
  agentId?: string; // stable, redacted agent identifier
  decision?: "allowed" | "denied" | "error";
  reason?: string; // machine-readable denial reason
  capability?: string;
  policyHash?: string; // stable policy identifier
  sandboxed?: boolean;
  breakGlass?: boolean; // whether a reviewed exception was used
  metadata?: Record<string, unknown>; // additional context
  // E4.1: Correlation and latency tracking
  correlationId?: string; // ties proposal→decision→result across flow
  evaluationTimeMs?: number; // how long did gate evaluation take
  executionTimeMs?: number; // how long did tool execution take
}

export interface DangerousCapabilityEvent extends SecurityEvent {
  type: "dangerous-capability-denied" | "dangerous-capability-allowed";
  capability: string;
  toolName: string;
  decision: "allowed" | "denied";
  reason?: string;
}

export interface DangerousPathEvent extends SecurityEvent {
  type: "dangerous-path-denied" | "dangerous-path-allowed";
  toolName: string;
  action: string;
  decision: "allowed" | "denied";
}

export interface PolicyDriftEvent extends SecurityEvent {
  type: "policy-drift-detected";
  level: "critical" | "warning";
  driftType: "authority-boundary" | "policy-hash" | "capability-grant" | "other";
  expected?: string;
  actual?: string;
}

export interface ProxyRejectionEvent extends SecurityEvent {
  type: "browser-proxy-rejected" | "canvas-auth-rejected";
  rejectionReason: string;
  attemptedPath?: string; // redacted
}

export interface ReviewedException extends SecurityEvent {
  type:
    | "exec-session-invoked"
    | "local-shell-activated"
    | "bootstrap-respawn-event"
    | "reviewed-exception-used";
  exceptionType: string;
  reason?: string;
}

export interface PluginScanEvent extends SecurityEvent {
  type: "plugin-scan-completed";
  pluginsScanned: number;
  dangerousPatternsFound: number;
  quarantinedCount: number;
}

export interface AuthorityBoundaryCheckEvent extends SecurityEvent {
  type: "authority-boundary-checked";
  scanResult: "passed" | "failed";
  violationsFound?: number;
  expectedScope?: string[];
}

/**
 * Security event emitter for structured logging.
 * Used throughout the runtime to emit structured audit events.
 */
export interface SecurityEventEmitter {
  emit(event: SecurityEvent): void;
  /**
   * Create a child emitter with additional context bindings.
   */
  child(bindings: Record<string, unknown>): SecurityEventEmitter;
}

/**
 * Create a no-op emitter (safe default).
 */
export function createNullSecurityEventEmitter(): SecurityEventEmitter {
  return {
    emit: () => {
      // no-op
    },
    child: () => createNullSecurityEventEmitter(),
  };
}

/**
 * E4.1: Generate a correlation ID for tracing a decision through the system.
 */
export function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
