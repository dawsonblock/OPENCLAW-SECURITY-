/**
 * RFSN Gate Event Emission Integration
 *
 * This module integrates security event emission into the RFSN gate workflow.
 * When the RFSN gate makes decisions (allow/deny), events are emitted for audit trail.
 */

import type { SecurityEventEmitter } from "../security/security-events.js";
import { getSecurityEventEmitter } from "../security/security-events-emit.js";
import { emitDangerousPathEvent } from "../security/security-events-emit.js";

/**
 * Wrap gate decisions with security event emission.
 *
 * This creates a middleware that captures and emits security events
 * whenever the gate makes a dangerous-path decision.
 */
export function createGateEventEmissionMiddleware(
  onDecision?: (event: {
    verdict: "allow" | "deny" | "error";
    reason?: string;
    toolName: string;
    sessionId?: string;
    agentId?: string;
    policyHash?: string;
    sandboxed?: boolean;
  }) => void,
) {
  const emitter = getSecurityEventEmitter();

  return {
    /**
     * Emit a dangerous-path decision event.
     */
    emitDecision(params: {
      verdict: "allow" | "deny" | "error";
      toolName: string;
      action?: string;
      reason?: string;
      sessionId?: string;
      agentId?: string;
      policyHash?: string;
      sandboxed?: boolean;
    }): void {
      // Emit to structured security event system
      emitDangerousPathEvent({
        emitter,
        toolName: params.toolName,
        action: params.action ?? "execute",
        decision: params.verdict === "allow" ? "allowed" : "denied",
        reason: params.reason,
        sessionId: params.sessionId,
        agentId: params.agentId,
        policyHash: params.policyHash,
        sandboxed: params.sandboxed,
      });

      // Call application-level callback if provided
      onDecision?.(params);
    },

    getEmitter(): SecurityEventEmitter {
      return emitter;
    },
  };
}

/**
 * Standard gate emission middleware instance for use throughout the runtime.
 */
let gateEventEmissionMiddleware: ReturnType<typeof createGateEventEmissionMiddleware> | null = null;

export function getGateEventEmissionMiddleware(): ReturnType<typeof createGateEventEmissionMiddleware> {
  if (!gateEventEmissionMiddleware) {
    gateEventEmissionMiddleware = createGateEventEmissionMiddleware();
  }
  return gateEventEmissionMiddleware;
}

export function setGateEventEmissionMiddleware(
  middleware: ReturnType<typeof createGateEventEmissionMiddleware>,
): void {
  gateEventEmissionMiddleware = middleware;
}
