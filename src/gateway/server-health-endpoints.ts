/**
 * DEPRECATED: Example health endpoints (for reference only).
 *
 * THIS IS NON-CANONICAL REFERENCE CODE.
 *
 * Use `health-endpoints.ts` instead for the production health/readiness/liveness interface.
 *
 * This file is kept for documentation purposes only and should not be used
 * in actual gateway runtime wiring. The actual live health path is via RPC.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig } from "../config/config.js";
import { HealthBuilder } from "../runtime/health-model.js";

/**
 * Runtime state for health monitoring (inject as needed).
 */
export interface RuntimeState {
  config: OpenClawConfig;
  gatewayStartedAtMs: number;
  componentsReady: Set<string>;
  degradedSubsystems: Map<string, string>; // subsystem -> reason
  lastSecurityIssue?: string;
}

/**
 * Create a health status HTTP endpoint (liveness + full status).
 */
export function createHealthEndpoint(state: RuntimeState) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const uptime = Date.now() - state.gatewayStartedAtMs;
    const allComponentsReady = state.componentsReady.size > 0 && !state.lastSecurityIssue;

    const builder = new HealthBuilder();

    // Always alive if responding.
    builder.setLiveness(true);

    // Readiness: clear blockers if all components initialized.
    if (!allComponentsReady) {
      builder.addReadinessBlocker("startup in progress");
    } else {
      builder.clearReadinessBlockers();
    }

    // Security posture: report any recent issues.
    if (state.lastSecurityIssue) {
      builder.addSecurityIssue(state.lastSecurityIssue);
    } else {
      builder.clearSecurityIssues();
    }

    // Add component status.
    for (const component of ["gateway", "auth", "plugins"]) {
      const ready = state.componentsReady.has(component);
      builder.addComponent(component, ready ? "healthy" : "unhealthy");
    }

    // Mark degraded if optional subsystems failed.
    for (const [subsystem, reason] of state.degradedSubsystems) {
      builder.markDegraded(subsystem);
    }

    const health = builder.build();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ...health, uptime_ms: uptime }, null, 2));
  };
}

/**
 * Create a minimal readiness endpoint (just ready/not-ready).
 * Use this for orchestrator probes that just need a binary ready state.
 */
export function createReadinessEndpoint(state: RuntimeState) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const ready =
      state.componentsReady.size > 0 &&
      !state.lastSecurityIssue &&
      state.degradedSubsystems.size === 0;

    const statusCode = ready ? 200 : 503;
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ready,
        reason: ready ? "all systems ready" : "system not fully initialized",
      }),
    );
  };
}

/**
 * Example usage in gateway startup:
 *
 *   const runtimeState: RuntimeState = {
 *     config: cfg,
 *     gatewayStartedAtMs: Date.now(),
 *     componentsReady: new Set(),
 *     degradedSubsystems: new Map(),
 *   };
 *
 *   // During startup, add components as they initialize:
 *   runtimeState.componentsReady.add("gateway");
 *   runtimeState.componentsReady.add("auth");
 *
 *   // If an optional subsystem fails:
 *   runtimeState.degradedSubsystems.set("browser", "proxy initialization failed");
 *
 *   // Mount endpoints:
 *   app.get("/health", createHealthEndpoint(runtimeState));
 *   app.get/ready", createReadinessEndpoint(runtimeState));
 *
 *   // Check health from operator:
 *   // curl http://127.0.0.1:18789/health
 */
