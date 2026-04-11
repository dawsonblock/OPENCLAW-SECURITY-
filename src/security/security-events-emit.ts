/**
 * Security event emission for operational observability.
 *
 * Emits structured, redacted, machine-readable events for:
 * - dangerous capability decisions
 * - dangerous-path approvals/denials
 * - policy drift detection
 * - proxy rejections
 * - reviewed exception use
 *
 * E4.1: Added correlation ID and latency tracking support
 *
 * Events are emitted via structured logging transport and can be
 * consumed by audit dashboards, SIEM systems, or forensic analysis tools.
 */

import type { SecurityEvent, SecurityEventEmitter } from "./security-events.js";
import { getChildLogger } from "../logging/logger.js";
import { createNullSecurityEventEmitter, generateCorrelationId } from "./security-events.js";

/**
 * Create a security event emitter backed by structured logging.
 * Events are emitted as JSON log lines with a stable "security_event" marker.
 */
export function createSecurityEventEmitter(
  bindings?: Record<string, unknown>,
): SecurityEventEmitter {
  const logger = getChildLogger({ module: "security-events", ...bindings });

  return {
    emit(event: SecurityEvent) {
      // Emit as a structured JSON log with fixed field names for parsing.
      logger.info({
        security_event: event.type,
        timestamp_ms: event.timestamp,
        level: event.level,
        tool_name: event.toolName,
        action: event.action,
        session_id: event.sessionId,
        agent_id: event.agentId,
        decision: event.decision,
        reason: event.reason,
        capability: event.capability,
        policy_hash: event.policyHash,
        sandboxed: event.sandboxed,
        break_glass: event.breakGlass,
        // E4.1: Correlation and latency fields
        correlation_id: event.correlationId,
        evaluation_time_ms: event.evaluationTimeMs,
        execution_time_ms: event.executionTimeMs,
        metadata: event.metadata,
      });
    },
    child(morBindings: Record<string, unknown>) {
      return createSecurityEventEmitter({
        ...bindings,
        ...morBindings,
      });
    },
  };
}

/**
 * Get the default security event emitter for the runtime.
 * Returns a null emitter if security event emission is disabled.
 */
export function getSecurityEventEmitter(): SecurityEventEmitter {
  const enabled = (process.env.OPENCLAW_SECURITY_EVENTS_ENABLED ?? "1").trim() !== "0";
  if (!enabled) {
    return createNullSecurityEventEmitter();
  }
  return createSecurityEventEmitter();
}

/**
 * Redact a session identifier to a stable, short hash.
 * Useful for logging session context without leaking raw session IDs.
 */
export function redactSessionId(sessionId: string): string {
  try {
    const { createHash } = require("node:crypto");
    const hash = createHash("sha256").update(sessionId).digest("hex").slice(0, 12);
    return `sess_${hash}`;
  } catch {
    return "sess_unknown";
  }
}

/**
 * Redact an agent identifier to a stable, short form.
 */
export function redactAgentId(agentId: string): string {
  try {
    const { createHash } = require("node:crypto");
    const hash = createHash("sha256").update(agentId).digest("hex").slice(0, 12);
    return `agent_${hash}`;
  } catch {
    return "agent_unknown";
  }
}

/**
 * E4.1: Helper to create dangerous-capability events with correlation ID and latency.
 */
export function emitDangerousCapabilityEvent(params: {
  emitter: SecurityEventEmitter;
  capability: string;
  toolName: string;
  decision: "allowed" | "denied";
  reason?: string;
  sessionId?: string;
  agentId?: string;
  sandboxed?: boolean;
  correlationId?: string;
  evaluationTimeMs?: number;
}): void {
  params.emitter.emit({
    type:
      params.decision === "allowed"
        ? "dangerous-capability-allowed"
        : "dangerous-capability-denied",
    timestamp: Date.now(),
    level: params.decision === "denied" ? "warning" : "info",
    capability: params.capability,
    toolName: params.toolName,
    decision: params.decision,
    reason: params.reason,
    sessionId: params.sessionId ? redactSessionId(params.sessionId) : undefined,
    agentId: params.agentId ? redactAgentId(params.agentId) : undefined,
    sandboxed: params.sandboxed,
    // E4.1: Add correlation and latency
    correlationId: params.correlationId,
    evaluationTimeMs: params.evaluationTimeMs,
  });
}

/**
 * E4.1: Helper to create dangerous-path decision events with correlation ID and latency.
 */
export function emitDangerousPathEvent(params: {
  emitter: SecurityEventEmitter;
  toolName: string;
  action: string;
  decision: "allowed" | "denied";
  reason?: string;
  sessionId?: string;
  agentId?: string;
  policyHash?: string;
  sandboxed?: boolean;
  correlationId?: string;
  evaluationTimeMs?: number;
  executionTimeMs?: number;
}): void {
  params.emitter.emit({
    type: params.decision === "allowed" ? "dangerous-path-allowed" : "dangerous-path-denied",
    timestamp: Date.now(),
    level: params.decision === "denied" ? "warning" : "info",
    toolName: params.toolName,
    action: params.action,
    decision: params.decision,
    reason: params.reason,
    sessionId: params.sessionId ? redactSessionId(params.sessionId) : undefined,
    agentId: params.agentId ? redactAgentId(params.agentId) : undefined,
    policyHash: params.policyHash,
    sandboxed: params.sandboxed,
    // E4.1: Add correlation and latency
    correlationId: params.correlationId,
    evaluationTimeMs: params.evaluationTimeMs,
    executionTimeMs: params.executionTimeMs,
  });
}

/**
 * Helper to emit reviewed exception usage.
 */
export function emitReviewedException(params: {
  emitter: SecurityEventEmitter;
  type: "exec-session" | "local-shell" | "bootstrap-respawn";
  reason?: string;
  sessionId?: string;
  agentId?: string;
}): void {
  const typeMap = {
    "exec-session": "exec-session-invoked" as const,
    "local-shell": "local-shell-activated" as const,
    "bootstrap-respawn": "bootstrap-respawn-event" as const,
  };

  params.emitter.emit({
    type: typeMap[params.type],
    timestamp: Date.now(),
    level: "info",
    reason: params.reason,
    sessionId: params.sessionId ? redactSessionId(params.sessionId) : undefined,
    agentId: params.agentId ? redactAgentId(params.agentId) : undefined,
  });
}

export { createNullSecurityEventEmitter, generateCorrelationId };
