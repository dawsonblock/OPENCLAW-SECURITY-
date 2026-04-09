/**
 * Extended security event types for comprehensive operational observability.
 *
 * These events cover additional scenarios beyond the core dangerous-path flow:
 * - Resource exhaustion and limiter triggers
 * - Sandbox failures and degradation
 * - Policy enforcement overrides
 * - Capability grant denials with detailed reasons
 */

import type { SecurityEvent } from "./security-events.js";

export type ExtendedSecurityEventType =
  | "dangerous-action-limiter-triggered"
  | "sandbox-startup-failure"
  | "sandbox-execution-failure"
  | "capability-grant-denied"
  | "policy-enforcement-degraded"
  | "gateway-startup-invariant-failed"
  | "gateway-startup-invariant-passed"
  | "tool-invocation-timeout"
  | "resource-limit-exceeded";

/**
 * Dangerous action limiter triggered (too many concurrent dangerous actions).
 */
export interface DangerousActionLimiterEvent extends SecurityEvent {
  type: "dangerous-action-limiter-triggered";
  level: "critical" | "warning";
  currentCount: number;
  maxLimit: number;
  action?: string;
  sessionId?: string;
  rejectionReason: string;
}

/**
 * Sandbox startup failure (container/process creation failed).
 */
export interface SandboxStartupFailureEvent extends SecurityEvent {
  type: "sandbox-startup-failure";
  level: "warning" | "critical";
  sessionId?: string;
  sandboxType?: string; // "docker" | "process" | "other"
  errorMessage: string;
  recoveryAttempted?: boolean;
}

/**
 * Sandbox execution failure (tool died or timed out in sandbox).
 */
export interface SandboxExecutionFailureEvent extends SecurityEvent {
  type: "sandbox-execution-failure";
  level: "warning";
  toolName: string;
  sessionId?: string;
  sandboxType?: string;
  exitCode?: number;
  signal?: string;
  timeoutMs?: number;
}

/**
 * Capability grant explicitly denied (not due to policy, but grant rules).
 */
export interface CapabilityGrantDeniedEvent extends SecurityEvent {
  type: "capability-grant-denied";
  level: "info" | "warning";
  capability: string;
  toolName: string;
  reason: string; // e.g., "capability not in granted set"
  grantedCapabilities?: string[]; // for context
  requiredCapabilities?: string[];
  sessionId?: string;
}

/**
 * Policy enforcement degraded (allowing despite issues).
 */
export interface PolicyEnforcementDegradedEvent extends SecurityEvent {
  type: "policy-enforcement-degraded";
  level: "warning";
  toolName: string;
  reason: string; // e.g., "audit daemon offline but allowing"
  allowedDespite: string[]; // e.g., ["missing-audit", "policy-drift-detected"]
  sessionId?: string;
}

/**
 * Gateway startup invariant failed.
 */
export interface GatewayStartupInvariantFailedEvent extends SecurityEvent {
  type: "gateway-startup-invariant-failed";
  level: "critical";
  invariant: string; // e.g., "gateway-auth-configured"
  details: string;
  recoveryStep?: string;
}

/**
 * Gateway startup invariant passed.
 */
export interface GatewayStartupInvariantPassedEvent extends SecurityEvent {
  type: "gateway-startup-invariant-passed";
  level: "info";
  invariant: string;
  details: string;
}

/**
 * Tool invocation timeout (exceeded max execution time).
 */
export interface ToolInvocationTimeoutEvent extends SecurityEvent {
  type: "tool-invocation-timeout";
  level: "warning";
  toolName: string;
  timeoutMs: number;
  sessionId?: string;
  sandboxed?: boolean;
  terminationSignal?: string; // "SIGTERM" | "SIGKILL"
}

/**
 * Resource limit exceeded (memory, disk, file handles, etc).
 */
export interface ResourceLimitExceededEvent extends SecurityEvent {
  type: "resource-limit-exceeded";
  level: "warning";
  resourceType: "memory" | "disk" | "file-handles" | "stdout" | "other";
  limit: number;
  current: number;
  unit: string; // "bytes", "files", "lines"
  toolName?: string;
  sessionId?: string;
}
