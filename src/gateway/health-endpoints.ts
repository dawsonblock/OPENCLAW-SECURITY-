/**
 * HTTP health check endpoints for gateway operational observability.
 *
 * Provides:
 * - /health (full health status)
 * - /ready (readiness check)
 * - /alive (liveness check)
 *
 * Can be integrated into Express, Fastify, or other HTTP frameworks.
 */

import type { RuntimeHealth } from "../runtime/health-model.js";

/**
 * Runtime state interface for health endpoint.
 */
export interface GatewayRuntimeState {
  gatewayStartedAtMs: number;
  lastHealthCheckMs?: number;
  currentHealth?: RuntimeHealth;
  isShuttingDown?: boolean;
}

/**
 * Create health check HTTP handler (Express-style).
 *
 * Usage with Express:
 * ```
 * const getHealth = createHealthCheckHandler(runtimeState, computeRuntimeHealth);
 * app.get("/health", getHealth);
 * ```
 */
export function createHealthCheckHandler(
  runtimeState: GatewayRuntimeState,
  computeHealth: () => Promise<RuntimeHealth>,
) {
  return async (req: any, res: any) => {
    try {
      const health = await computeHealth();
      runtimeState.currentHealth = health;
      runtimeState.lastHealthCheckMs = Date.now();

      // Determine HTTP status code
      let statusCode = 200;
      if (health.status === "unhealthy") {
        statusCode = 503; // Service Unavailable
      } else if (health.status === "degraded") {
        statusCode = 200; // Still OK, just degraded
      }

      res.status(statusCode).json(health);
    } catch (err) {
      res.status(503).json({
        status: "unhealthy",
        error: `Health check failed: ${String(err)}`,
      });
    }
  };
}

/**
 * Create readiness check handler.
 *
 * Returns 200 only if ready to receive work.
 * Used by orchestrators (Kubernetes, etc) for load balancer decisions.
 */
export function createReadinessHandler(
  runtimeState: GatewayRuntimeState,
  computeHealth: () => Promise<RuntimeHealth>,
) {
  return async (req: any, res: any) => {
    try {
      const health = await computeHealth();

      const ready = health.readiness.status === "ready" && health.status !== "unhealthy";

      const statusCode = ready ? 200 : 503;
      res.status(statusCode).json({
        ready,
        timestamp: health.timestamp,
        blockers: health.readiness.blockers,
        issues: health.security_posture.issues,
      });
    } catch (err) {
      res.status(503).json({ ready: false, error: String(err) });
    }
  };
}

/**
 * Create liveness handler.
 *
 * Always returns 200 if process is running.
 * Used by orchestrators to detect dead processes.
 */
export function createLivenessHandler(runtimeState: GatewayRuntimeState) {
  return (req: any, res: any) => {
    const uptime = Date.now() - runtimeState.gatewayStartedAtMs;
    res.status(200).json({
      alive: true,
      uptime_ms: uptime,
      timestamp: Date.now(),
    });
  };
}

/**
 * Quick status endpoint (no full health computation).
 * Used for frequent monitoring without expensive checks.
 */
export function createQuickStatusHandler(runtimeState: GatewayRuntimeState) {
  return (req: any, res: any) => {
    const health = runtimeState.currentHealth;
    if (!health) {
      res.status(503).json({ status: "unknown", message: "Health not yet computed" });
      return;
    }

    res.status(200).json({
      status: health.status,
      readiness: health.readiness.status,
      security_posture: health.security_posture.status,
      degraded_subsystems: health.degraded_subsystems,
      timestamp: health.timestamp,
      uptime_ms: Date.now() - runtimeState.gatewayStartedAtMs,
    });
  };
}

/**
 * Metrics endpoint (for Prometheus scraping).
 *
 * Usage: mount at /metrics for Prometheus-compatible scraping
 */
export function createMetricsHandler(runtimeState: GatewayRuntimeState) {
  return (req: any, res: any) => {
    const health = runtimeState.currentHealth;
    const uptime = Date.now() - runtimeState.gatewayStartedAtMs;

    let metrics = "";

    // Gateway uptime
    metrics += `# HELP openclaw_uptime_seconds Gateway uptime in seconds\n`;
    metrics += `# TYPE openclaw_uptime_seconds gauge\n`;
    metrics += `openclaw_uptime_seconds ${uptime / 1000}\n\n`;

    // Gateway health status
    metrics += `# HELP openclaw_health_status Health status (0=healthy, 1=degraded, 2=unhealthy)\n`;
    metrics += `# TYPE openclaw_health_status gauge\n`;
    if (health) {
      const statusValue = health.status === "healthy" ? 0 : health.status === "degraded" ? 1 : 2;
      metrics += `openclaw_health_status ${statusValue}\n\n`;
    }

    // Readiness
    metrics += `# HELP openclaw_ready Ready to receive work (0=not ready, 1=ready)\n`;
    metrics += `# TYPE openclaw_ready gauge\n`;
    if (health) {
      const readyValue = health.readiness.status === "ready" ? 1 : 0;
      metrics += `openclaw_ready ${readyValue}\n\n`;
    }

    // Degraded subsystems count
    if (health) {
      metrics += `# HELP openclaw_degraded_subsystems Number of degraded subsystems\n`;
      metrics += `# TYPE openclaw_degraded_subsystems gauge\n`;
      metrics += `openclaw_degraded_subsystems ${health.degraded_subsystems.length}\n\n`;
    }

    // Component count
    if (health) {
      const healthyComponents = health.components.filter((c) => c.status === "healthy").length;
      const degradedComponents = health.components.filter((c) => c.status === "degraded").length;
      const unhealthyComponents = health.components.filter((c) => c.status === "unhealthy").length;

      metrics += `# HELP openclaw_components_healthy Number of healthy components\n`;
      metrics += `# TYPE openclaw_components_healthy gauge\n`;
      metrics += `openclaw_components_healthy ${healthyComponents}\n\n`;

      metrics += `# HELP openclaw_components_degraded Number of degraded components\n`;
      metrics += `# TYPE openclaw_components_degraded gauge\n`;
      metrics += `openclaw_components_degraded ${degradedComponents}\n\n`;

      metrics += `# HELP openclaw_components_unhealthy Number of unhealthy components\n`;
      metrics += `# TYPE openclaw_components_unhealthy gauge\n`;
      metrics += `openclaw_components_unhealthy ${unhealthyComponents}\n\n`;
    }

    res.status(200).set("Content-Type", "text/plain").send(metrics);
  };
}

/**
 * Integration helper: mount health endpoints on Express app.
 *
 * Usage:
 * ```
 * import express from "express";
 * import { mountHealthEndpoints } from "./health-endpoints.js";
 *
 * const app = express();
 * const runtimeState: GatewayRuntimeState = { gatewayStartedAtMs: Date.now() };
 *
 * mountHealthEndpoints(app, runtimeState, computeRuntimeHealth);
 * ```
 */
export function mountHealthEndpoints(
  app: any, // Express app
  runtimeState: GatewayRuntimeState,
  computeHealth: () => Promise<RuntimeHealth>,
): void {
  const healthHandler = createHealthCheckHandler(runtimeState, computeHealth);
  const readinessHandler = createReadinessHandler(runtimeState, computeHealth);
  const livenessHandler = createLivenessHandler(runtimeState);
  const statusHandler = createQuickStatusHandler(runtimeState);
  const metricsHandler = createMetricsHandler(runtimeState);

  // Standard health endpoints
  app.get("/health", healthHandler);
  app.get("/ready", readinessHandler);
  app.get("/alive", livenessHandler);
  app.get("/status", statusHandler);
  app.get("/metrics", metricsHandler);

  // Health checks (Kubernetes-style aliases)
  app.get("/healthz", livenessHandler);
  app.get("/readyz", readinessHandler);
  app.get("/livez", livenessHandler);
}
