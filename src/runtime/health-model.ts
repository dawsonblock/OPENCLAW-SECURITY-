/**
 * Health and readiness model for OpenCLAW runtime.
 *
 * Supports:
 * - liveness: process is alive
 * - readiness: startup invariants passed, required components ready
 * - security posture readiness: authority config, policy hash, auth prerequisites valid
 * - degraded mode: runtime alive but non-critical subsystems unhealthy
 */

import type { OpenClawConfig } from "../config/config.js";

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message?: string;
}

export interface RuntimeHealth {
  status: HealthStatus;
  timestamp: number;
  liveness: {
    status: "alive" | "dead";
  };
  readiness: {
    status: "ready" | "not-ready";
    blockers: string[];
  };
  security_posture: {
    status: "valid" | "invalid";
    issues: string[];
  };
  components: ComponentHealth[];
  degraded_subsystems: string[];
}

/**
 * Startup invariants that must pass for readiness.
 */
export const STARTUP_INVARIANTS = [
  "gateway-auth-configured",
  "authority-boundary-config-loaded",
  "policy-posture-hash-valid",
  "workspace-permissions-valid",
] as const;

/**
 * Optional but relevant subsystems that can degrade independently.
 */
export const OPTIONAL_SUBSYSTEMS = [
  "browser-subsystem",
  "forensics-anchor",
  "background-audit",
  "memory-backend",
  "plugin-registry",
  "gmail-watcher",
] as const;

/**
 * Create an empty health report (startup state).
 */
export function createEmptyHealth(): RuntimeHealth {
  return {
    status: "unhealthy",
    timestamp: Date.now(),
    liveness: {
      status: "alive",
    },
    readiness: {
      status: "not-ready",
      blockers: [],
    },
    security_posture: {
      status: "valid",
      issues: [],
    },
    components: [],
    degraded_subsystems: [],
  };
}

/**
 * Compute overall health status from component states.
 */
export function computeHealthStatus(health: RuntimeHealth): HealthStatus {
  if (health.readiness.blockers.length > 0) {
    return "unhealthy";
  }
  if (health.security_posture.issues.length > 0) {
    return "unhealthy";
  }
  if (health.degraded_subsystems.length > 0) {
    return "degraded";
  }
  return "healthy";
}

/**
 * Builder for constructing health reports progressively.
 */
export class HealthBuilder {
  private health: RuntimeHealth;

  constructor() {
    this.health = createEmptyHealth();
  }

  setLiveness(alive: boolean): this {
    this.health.liveness.status = alive ? "alive" : "dead";
    return this;
  }

  addReadinessBlocker(reason: string): this {
    if (!this.health.readiness.blockers.includes(reason)) {
      this.health.readiness.blockers.push(reason);
    }
    return this;
  }

  clearReadinessBlockers(): this {
    this.health.readiness.blockers = [];
    return this;
  }

  addSecurityIssue(issue: string): this {
    if (!this.health.security_posture.issues.includes(issue)) {
      this.health.security_posture.issues.push(issue);
    }
    return this;
  }

  clearSecurityIssues(): this {
    this.health.security_posture.issues = [];
    return this;
  }

  addComponent(name: string, status: HealthStatus, message?: string): this {
    this.health.components.push({ name, status, message });
    return this;
  }

  markDegraded(subsystem: string): this {
    if (!this.health.degraded_subsystems.includes(subsystem)) {
      this.health.degraded_subsystems.push(subsystem);
    }
    return this;
  }

  build(): RuntimeHealth {
    this.health.readiness.status =
      this.health.readiness.blockers.length === 0 ? "ready" : "not-ready";
    this.health.security_posture.status =
      this.health.security_posture.issues.length === 0 ? "valid" : "invalid";
    this.health.status = computeHealthStatus(this.health);
    this.health.timestamp = Date.now();
    return this.health;
  }
}

/**
 * Validation result from health/startup checks.
 */
export interface StartupCheckResult {
  passed: boolean;
  criticalIssues: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * Run startup health checks against config and environment.
 */
export function runStartupChecks(params: {
  cfg: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  checkBrowser?: boolean;
  checkExtensions?: boolean;
}): StartupCheckResult {
  const critical: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Check gateway auth mode is configured.
  if (!params.cfg.gateway?.mode) {
    critical.push("gateway.mode is not set; run 'openclaw configure' to set it");
  }

  // Check workspace paths exist.
  const workspaceRoot = params.cfg.workspace?.root;
  if (workspaceRoot) {
    try {
      const fs = require("node:fs");
      fs.accessSync(workspaceRoot, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
      critical.push(
        `workspace root ${workspaceRoot} is not readable/writable; check permissions`,
      );
    }
  }

  // Warn if safe mode is enabled in production.
  if ((process.env.OPENCLAW_SAFE_MODE ?? "").trim() === "1") {
    warnings.push("OPENCLAW_SAFE_MODE=1 is enabled; some features are restricted");
  }

  // Warn if critical auth is not configured for local mode.
  if (params.cfg.gateway?.mode === "local") {
    const hasAuth =
      params.cfg.gateway?.auth?.token || params.cfg.gateway?.auth?.password;
    if (!hasAuth) {
      suggestions.push(
        "Generate and configure a gateway token for local mode: 'openclaw doctor --fix' or set OPENCLAW_GATEWAY_TOKEN",
      );
    }
  }

  // Optional checks.
  if (params.checkBrowser && params.cfg.browser?.enabled) {
    if (!params.cfg.browser?.proxyPort) {
      warnings.push("browser.proxyPort is not configured; browser features may not work");
    }
  }

  if (params.checkExtensions && params.cfg.extensions?.enabled) {
    if (!params.cfg.extensions?.roots || params.cfg.extensions.roots.length === 0) {
      suggestions.push(
        "extensions.roots is empty; no extension directories will be scanned",
      );
    }
  }

  return {
    passed: critical.length === 0,
    criticalIssues: critical,
    warnings,
    suggestions,
  };
}
