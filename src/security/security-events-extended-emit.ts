/**
 * Helper functions for extended security event emission.
 *
 * Provides convenience functions for common extended event scenarios.
 */

import type { SecurityEventEmitter } from "./security-events.js";
import type {
  DangerousActionLimiterEvent,
  SandboxStartupFailureEvent,
  SandboxExecutionFailureEvent,
  CapabilityGrantDeniedEvent,
  PolicyEnforcementDegradedEvent,
  GatewayStartupInvariantFailedEvent,
  ToolInvocationTimeoutEvent,
  ResourceLimitExceededEvent,
} from "./security-events-extended.js";
import { redactSessionId, redactAgentId } from "./security-events-emit.js";

/**
 * Emit dangerous action limiter triggered event.
 */
export function emitDangerousActionLimiterTriggered(params: {
  emitter: SecurityEventEmitter;
  currentCount: number;
  maxLimit: number;
  action?: string;
  sessionId?: string;
}): void {
  params.emitter.emit({
    type: "dangerous-action-limiter-triggered",
    timestamp: Date.now(),
    level: params.currentCount >= params.maxLimit ? "critical" : "warning",
    currentCount: params.currentCount,
    maxLimit: params.maxLimit,
    action: params.action,
    sessionId: params.sessionId ? redactSessionId(params.sessionId) : undefined,
    rejectionReason: `Dangerous action limit exceeded: ${params.currentCount}/${params.maxLimit}`,
  } as DangerousActionLimiterEvent);
}

/**
 * Emit sandbox startup failure event.
 */
export function emitSandboxStartupFailure(params: {
  emitter: SecurityEventEmitter;
  sessionId?: string;
  sandboxType?: string;
  error: Error;
  recoveryAttempted?: boolean;
}): void {
  params.emitter.emit({
    type: "sandbox-startup-failure",
    timestamp: Date.now(),
    level: "critical",
    sessionId: params.sessionId ? redactSessionId(params.sessionId) : undefined,
    sandboxType: params.sandboxType,
    errorMessage: params.error.message,
    recoveryAttempted: params.recoveryAttempted,
  } as SandboxStartupFailureEvent);
}

/**
 * Emit sandbox execution failure event.
 */
export function emitSandboxExecutionFailure(params: {
  emitter: SecurityEventEmitter;
  toolName: string;
  sessionId?: string;
  sandboxType?: string;
  exitCode?: number;
  signal?: string;
  timeoutMs?: number;
}): void {
  params.emitter.emit({
    type: "sandbox-execution-failure",
    timestamp: Date.now(),
    level: "warning",
    toolName: params.toolName,
    sessionId: params.sessionId ? redactSessionId(params.sessionId) : undefined,
    sandboxType: params.sandboxType,
    exitCode: params.exitCode,
    signal: params.signal,
    timeoutMs: params.timeoutMs,
  } as SandboxExecutionFailureEvent);
}

/**
 * Emit capability grant denied event.
 */
export function emitCapabilityGrantDenied(params: {
  emitter: SecurityEventEmitter;
  capability: string;
  toolName: string;
  reason: string;
  grantedCapabilities?: string[];
  requiredCapabilities?: string[];
  sessionId?: string;
}): void {
  params.emitter.emit({
    type: "capability-grant-denied",
    timestamp: Date.now(),
    level: "info",
    capability: params.capability,
    toolName: params.toolName,
    reason: params.reason,
    grantedCapabilities: params.grantedCapabilities,
    requiredCapabilities: params.requiredCapabilities,
    sessionId: params.sessionId ? redactSessionId(params.sessionId) : undefined,
  } as CapabilityGrantDeniedEvent);
}

/**
 * Emit policy enforcement degraded event.
 */
export function emitPolicyEnforcementDegraded(params: {
  emitter: SecurityEventEmitter;
  toolName: string;
  reason: string;
  allowedDespite: string[];
  sessionId?: string;
}): void {
  params.emitter.emit({
    type: "policy-enforcement-degraded",
    timestamp: Date.now(),
    level: "warning",
    toolName: params.toolName,
    reason: params.reason,
    allowedDespite: params.allowedDespite,
    sessionId: params.sessionId ? redactSessionId(params.sessionId) : undefined,
  } as PolicyEnforcementDegradedEvent);
}

/**
 * Emit gateway startup invariant failed event.
 */
export function emitGatewayStartupInvariantFailed(params: {
  emitter: SecurityEventEmitter;
  invariant: string;
  details: string;
  recoveryStep?: string;
}): void {
  params.emitter.emit({
    type: "gateway-startup-invariant-failed",
    timestamp: Date.now(),
    level: "critical",
    invariant: params.invariant,
    details: params.details,
    recoveryStep: params.recoveryStep,
  } as GatewayStartupInvariantFailedEvent);
}

/**
 * Emit tool invocation timeout event.
 */
export function emitToolInvocationTimeout(params: {
  emitter: SecurityEventEmitter;
  toolName: string;
  timeoutMs: number;
  sessionId?: string;
  sandboxed?: boolean;
  terminationSignal?: string;
}): void {
  params.emitter.emit({
    type: "tool-invocation-timeout",
    timestamp: Date.now(),
    level: "warning",
    toolName: params.toolName,
    timeoutMs: params.timeoutMs,
    sessionId: params.sessionId ? redactSessionId(params.sessionId) : undefined,
    sandboxed: params.sandboxed,
    terminationSignal: params.terminationSignal,
  } as ToolInvocationTimeoutEvent);
}

/**
 * Emit resource limit exceeded event.
 */
export function emitResourceLimitExceeded(params: {
  emitter: SecurityEventEmitter;
  resourceType: "memory" | "disk" | "file-handles" | "stdout" | "other";
  limit: number;
  current: number;
  unit: string;
  toolName?: string;
  sessionId?: string;
}): void {
  params.emitter.emit({
    type: "resource-limit-exceeded",
    timestamp: Date.now(),
    level: "warning",
    resourceType: params.resourceType,
    limit: params.limit,
    current: params.current,
    unit: params.unit,
    toolName: params.toolName,
    sessionId: params.sessionId ? redactSessionId(params.sessionId) : undefined,
  } as ResourceLimitExceededEvent);
}
