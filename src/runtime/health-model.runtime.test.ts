import { describe, expect, it } from "vitest";
import {
  createEmptyHealth,
  computeHealthStatus,
  HealthBuilder,
  runStartupChecks,
  STARTUP_INVARIANTS,
  OPTIONAL_SUBSYSTEMS,
  type RuntimeHealth,
} from "./health-model.js";

/**
 * Integration test: Gateway health model and startup validation
 *
 * Proves that:
 * 1. Health snapshots correctly compute overall status from subsystems
 * 2. Startup validation catches critical issues
 * 3. Readiness blockers prevent ready status
 * 4. Security posture issues are detected
 * 5. Degraded subsystems don't block readiness
 */
describe("gateway health model (runtime integration)", () => {
  describe("empty health state", () => {
    it("should create unhealthy empty health report", () => {
      const health = createEmptyHealth();

      expect(health.status).toBe("unhealthy");
      expect(health.liveness.status).toBe("alive");
      expect(health.readiness.status).toBe("not-ready");
      expect(health.readiness.blockers.length).toBe(0);
      expect(health.security_posture.status).toBe("valid");
      expect(health.degraded_subsystems.length).toBe(0);
    });

    it("should initialize with empty components", () => {
      const health = createEmptyHealth();

      expect(health.components).toEqual([]);
      expect(health.subsystemHealth).toEqual({});
    });
  });

  describe("health status computation", () => {
    it("should be unhealthy when readiness blockers exist", () => {
      const health = createEmptyHealth();
      health.readiness.blockers.push("gateway-auth-not-configured");

      const status = computeHealthStatus(health);
      expect(status).toBe("unhealthy");
    });

    it("should be unhealthy when security posture is invalid", () => {
      const health = createEmptyHealth();
      health.security_posture.issues.push("policy-hash-drift-detected");

      const status = computeHealthStatus(health);
      expect(status).toBe("unhealthy");
    });

    it("should be degraded when subsystems are degraded", () => {
      const health = createEmptyHealth();
      health.degraded_subsystems.push("browser-subsystem");

      const status = computeHealthStatus(health);
      expect(status).toBe("degraded");
    });

    it("should be healthy when all systems are good", () => {
      const health = createEmptyHealth();
      health.readiness.blockers = [];
      health.security_posture.issues = [];
      health.degraded_subsystems = [];

      const status = computeHealthStatus(health);
      expect(status).toBe("healthy");
    });

    it("should prioritize unhealthy over degraded", () => {
      const health = createEmptyHealth();
      health.readiness.blockers.push("critical-issue");
      health.degraded_subsystems.push("optional-system");

      const status = computeHealthStatus(health);
      expect(status).toBe("unhealthy");
    });
  });

  describe("HealthBuilder API", () => {
    it("should build healthy status from scratch", () => {
      const health = new HealthBuilder()
        .setLiveness(true)
        .clearReadinessBlockers()
        .clearSecurityIssues()
        .build();

      expect(health.status).toBe("healthy");
      expect(health.liveness.status).toBe("alive");
      expect(health.readiness.status).toBe("ready");
      expect(health.security_posture.status).toBe("valid");
    });

    it("should track readiness blockers", () => {
      const health = new HealthBuilder()
        .addReadinessBlocker("gateway-auth-not-set")
        .addReadinessBlocker("workspace-not-writable")
        .build();

      expect(health.readiness.blockers).toContain("gateway-auth-not-set");
      expect(health.readiness.blockers).toContain("workspace-not-writable");
      expect(health.readiness.status).toBe("not-ready");
      expect(health.status).toBe("unhealthy");
    });

    it("should prevent duplicate readiness blockers", () => {
      const health = new HealthBuilder()
        .addReadinessBlocker("same-issue")
        .addReadinessBlocker("same-issue")
        .build();

      expect(health.readiness.blockers.filter((b) => b === "same-issue").length).toBe(1);
    });

    it("should track security issues", () => {
      const health = new HealthBuilder()
        .addSecurityIssue("posture-hash-mismatch")
        .addSecurityIssue("authority-boundary-invalid")
        .build();

      expect(health.security_posture.issues).toContain("posture-hash-mismatch");
      expect(health.security_posture.issues).toContain("authority-boundary-invalid");
      expect(health.security_posture.status).toBe("invalid");
      expect(health.status).toBe("unhealthy");
    });

    it("should track component health", () => {
      const health = new HealthBuilder()
        .addComponent("gateway", "healthy")
        .addComponent("browser", "degraded", "port unavailable")
        .addComponent("extensions", "unhealthy", "load error")
        .build();

      expect(health.components.length).toBe(3);
      expect(health.components[0]).toEqual({
        name: "gateway",
        status: "healthy",
      });
      expect(health.components[2]).toEqual({
        name: "extensions",
        status: "unhealthy",
        message: "load error",
      });
    });

    it("should mark subsystems as degraded", () => {
      const health = new HealthBuilder()
        .markDegraded("browser-subsystem")
        .markDegraded("forensics-anchor")
        .build();

      expect(health.degraded_subsystems).toContain("browser-subsystem");
      expect(health.degraded_subsystems).toContain("forensics-anchor");
      expect(health.status).toBe("degraded");
    });

    it("should not add duplicate degraded subsystems", () => {
      const health = new HealthBuilder()
        .markDegraded("browser")
        .markDegraded("browser")
        .build();

      expect(health.degraded_subsystems.filter((s) => s === "browser").length).toBe(1);
    });

    it("should record subsystem failures", () => {
      const health = new HealthBuilder()
        .recordSubsystemFailure("browser-subsystem", "Failed to connect to Chrome")
        .build();

      expect(health.subsystemHealth?.["browser-subsystem"]).toBeDefined();
      const status = health.subsystemHealth?.["browser-subsystem"];
      expect(status?.status).toBe("degraded");
      expect(status?.message).toBe("Failed to connect to Chrome");
      expect(status?.consecutiveFailures).toBe(1);
      expect(status?.lastFailureTimeMs).toBeDefined();
    });

    it("should escalate subsystem to error after multiple failures", () => {
      const health = new HealthBuilder()
        .recordSubsystemFailure("plugin-registry", "Load error 1")
        .recordSubsystemFailure("plugin-registry", "Load error 2")
        .recordSubsystemFailure("plugin-registry", "Load error 3")
        .build();

      const status = health.subsystemHealth?.["plugin-registry"];
      expect(status?.status).toBe("error");
      expect(status?.consecutiveFailures).toBe(3);
    });

    it("should record subsystem recovery", () => {
      let health = new HealthBuilder()
        .recordSubsystemFailure("browser-subsystem", "Connection failed")
        .build();

      expect(health.subsystemHealth?.["browser-subsystem"]?.status).toBe("degraded");
      expect(health.degraded_subsystems).toContain("browser-subsystem");

      health = new HealthBuilder()
        .setSubsystemHealth("browser-subsystem", { status: "healthy" })
        .recordSubsystemRecovery("browser-subsystem")
        .build();

      expect(health.subsystemHealth?.["browser-subsystem"]?.status).toBe("healthy");
      expect(health.subsystemHealth?.["browser-subsystem"]?.consecutiveFailures).toBe(0);
      expect(health.degraded_subsystems).not.toContain("browser-subsystem");
    });

    it("should update timestamp on build", () => {
      const before = Date.now();
      const health = new HealthBuilder().build();
      const after = Date.now();

      expect(health.timestamp).toBeGreaterThanOrEqual(before);
      expect(health.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("startup invariants and checks", () => {
    it("should define startup invariants", () => {
      expect(STARTUP_INVARIANTS.length).toBeGreaterThan(0);
      expect(STARTUP_INVARIANTS).toContain("gateway-auth-configured");
      expect(STARTUP_INVARIANTS).toContain("authority-boundary-config-loaded");
    });

    it("should define optional subsystems", () => {
      expect(OPTIONAL_SUBSYSTEMS.length).toBeGreaterThan(0);
      expect(OPTIONAL_SUBSYSTEMS).toContain("browser-subsystem");
      expect(OPTIONAL_SUBSYSTEMS).toContain("plugin-registry");
    });

    it("should validate gateway auth configuration", () => {
      const result = runStartupChecks({
        cfg: {},
        env: {},
      });

      expect(result.passed).toBe(false);
      expect(result.criticalIssues.length).toBeGreaterThan(0);
      expect(result.criticalIssues.some((issue) => issue.includes("gateway.mode"))).toBe(true);
    });

    it("should pass when gateway mode is set", () => {
      const result = runStartupChecks({
        cfg: { gateway: { mode: "local" } },
        env: {},
      });

      // May have other issues (workspace, etc), but gateway.mode check should pass
      expect(result.criticalIssues.some((issue) => issue.includes("gateway.mode"))).toBe(false);
    });

    it("should warn when safe mode is enabled", () => {
      const result = runStartupChecks({
        cfg: { gateway: { mode: "local" } },
        env: { OPENCLAW_SAFE_MODE: "1" },
      });

      expect(result.warnings.some((w) => w.includes("OPENCLAW_SAFE_MODE"))).toBe(true);
    });

    it("should suggest gateway token for local mode", () => {
      const result = runStartupChecks({
        cfg: { gateway: { mode: "local" } },
        env: {},
      });

      expect(result.suggestions.some((s) => s.includes("gateway token"))).toBe(true);
    });

    it("should not suggest gateway token for non-local mode", () => {
      const result = runStartupChecks({
        cfg: { gateway: { mode: "tailscale" } },
        env: {},
      });

      expect(result.suggestions.some((s) => s.includes("gateway token"))).toBe(false);
    });

    it("should warn about browser config if enabled", () => {
      const result = runStartupChecks({
        cfg: {
          gateway: { mode: "local" },
          browser: { enabled: true },
        },
        env: {},
        checkBrowser: true,
      });

      expect(result.warnings.some((w) => w.includes("proxyPort"))).toBe(true);
    });

    it("should suggest extensions configuration", () => {
      const result = runStartupChecks({
        cfg: {
          gateway: { mode: "local" },
          extensions: { enabled: true },
        },
        env: {},
        checkExtensions: true,
      });

      expect(result.suggestions.some((s) => s.includes("extensions.roots"))).toBe(true);
    });
  });

  describe("degraded subsystems don't block readiness", () => {
    it("should allow ready status with degraded optional systems", () => {
      const health = new HealthBuilder()
        .clearReadinessBlockers()
        .clearSecurityIssues()
        .markDegraded("browser-subsystem")
        .markDegraded("forensics-anchor")
        .build();

      expect(health.readiness.status).toBe("ready");
      expect(health.status).toBe("degraded");
    });

    it("should distinguish degraded from unhealthy", () => {
      const degraded = new HealthBuilder()
        .clearReadinessBlockers()
        .clearSecurityIssues()
        .markDegraded("browser-subsystem")
        .build();

      const unhealthy = new HealthBuilder()
        .addReadinessBlocker("critical-auth-missing")
        .build();

      expect(degraded.readiness.status).toBe("ready");
      expect(degraded.status).toBe("degraded");

      expect(unhealthy.readiness.status).toBe("not-ready");
      expect(unhealthy.status).toBe("unhealthy");
    });
  });

  describe("end-to-end: full health lifecycle", () => {
    it("should track health from startup to ready state", () => {
      // Startup: unhealthy, not ready
      let health = createEmptyHealth();
      expect(health.status).toBe("unhealthy");
      expect(health.readiness.status).toBe("not-ready");

      // Loading config: still not ready
      health = new HealthBuilder()
        .setLiveness(true)
        .addReadinessBlocker("authority-boundary-loading")
        .build();
      expect(health.status).toBe("unhealthy");

      // Config loaded: ready
      health = new HealthBuilder()
        .setLiveness(true)
        .clearReadinessBlockers()
        .clearSecurityIssues()
        .build();
      expect(health.readiness.status).toBe("ready");
      expect(health.status).toBe("healthy");

      // Browser subsystem fails: degraded but still ready
      health = new HealthBuilder()
        .setLiveness(true)
        .clearReadinessBlockers()
        .clearSecurityIssues()
        .recordSubsystemFailure("browser-subsystem", "Chrome unreachable")
        .build();
      expect(health.readiness.status).toBe("ready");
      expect(health.status).toBe("degraded");
    });

    it("should integrate startup checks into readiness decision", () => {
      const checkResult = runStartupChecks({
        cfg: { gateway: { mode: "local" } },
        env: {},
      });

      let health: RuntimeHealth;
      if (checkResult.passed) {
        health = new HealthBuilder()
          .setLiveness(true)
          .clearReadinessBlockers()
          .clearSecurityIssues()
          .build();
      } else {
        health = new HealthBuilder()
          .setLiveness(true)
          .clearReadinessBlockers();
        for (const issue of checkResult.criticalIssues) {
          health = health.addReadinessBlocker(issue);
        }
        health = health.build();
      }

      // Should be unhealthy if startup checks failed
      if (!checkResult.passed) {
        expect(health.status).toBe("unhealthy");
        expect(health.readiness.status).toBe("not-ready");
      }
    });
  });
});
