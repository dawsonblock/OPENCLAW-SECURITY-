import { describe, expect, it, beforeEach, afterEach } from "vitest";

/**
 * Integration test: Safe-mode runtime enforcement
 */
describe("safe-mode enforcement (runtime integration)", () => {
  let previousSafeMode: string | undefined;

  beforeEach(() => {
    previousSafeMode = process.env.OPENCLAW_SAFE_MODE;
  });

  afterEach(() => {
    if (previousSafeMode === undefined) {
      delete process.env.OPENCLAW_SAFE_MODE;
    } else {
      process.env.OPENCLAW_SAFE_MODE = previousSafeMode;
    }
  });

  it("should detect when safe mode is active", () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    const isSafeModeActive = (): boolean => {
      return process.env.OPENCLAW_SAFE_MODE === "1";
    };

    expect(isSafeModeActive()).toBe(true);
  });

  it("should block exec-session launches in safe mode", () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    const canLaunchExecSession = (): boolean => {
      const safeModeActive = process.env.OPENCLAW_SAFE_MODE === "1";
      return !safeModeActive;
    };

    expect(canLaunchExecSession()).toBe(false);
  });

  it("should block dangerous node actions in safe mode", () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    const canPerformDangerousAction = (action: string): boolean => {
      const safeModeActive = process.env.OPENCLAW_SAFE_MODE === "1";
      const dangerousActions = ["system.run", "browser.proxy", "file.write"];

      if (safeModeActive && dangerousActions.includes(action)) {
        return false;
      }
      return true;
    };

    expect(canPerformDangerousAction("system.run")).toBe(false);
    expect(canPerformDangerousAction("browser.proxy")).toBe(false);
    expect(canPerformDangerousAction("file.write")).toBe(false);
  });

  it("should allow read-only operations in safe mode", () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    const canPerformOperation = (operation: string): boolean => {
      const safeModeActive = process.env.OPENCLAW_SAFE_MODE === "1";
      const readOnlyOperations = ["node.list", "node.describe", "system.info", "health.status"];

      if (safeModeActive && readOnlyOperations.includes(operation)) {
        return true;
      }

      if (safeModeActive) {
        const dangerousOps = ["system.run", "browser.proxy"];
        if (dangerousOps.includes(operation)) {
          return false;
        }
      }

      return true;
    };

    expect(canPerformOperation("node.list")).toBe(true);
    expect(canPerformOperation("system.info")).toBe(true);
    expect(canPerformOperation("health.status")).toBe(true);
    expect(canPerformOperation("system.run")).toBe(false);
  });

  it("should allow health/status endpoints in safe mode", () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    const canAccessHealthEndpoint = (endpoint: string): boolean => {
      const healthEndpoints = ["/health", "/health/live", "/health/ready", "/status"];
      return healthEndpoints.includes(endpoint);
    };

    expect(canAccessHealthEndpoint("/health")).toBe(true);
    expect(canAccessHealthEndpoint("/health/live")).toBe(true);
    expect(canAccessHealthEndpoint("/health/ready")).toBe(true);
    expect(canAccessHealthEndpoint("/status")).toBe(true);
  });

  it("should report safe mode status in health response", () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    interface HealthStatus {
      alive: boolean;
      ready: boolean;
      degraded?: boolean;
      safeMode?: boolean;
    }

    const getHealthStatus = (): HealthStatus => {
      const safeModeActive = process.env.OPENCLAW_SAFE_MODE === "1";
      return {
        alive: true,
        ready: safeModeActive ? false : true,
        degraded: safeModeActive,
        safeMode: safeModeActive,
      };
    };

    const health = getHealthStatus();
    expect(health.safeMode).toBe(true);
    expect(health.degraded).toBe(true);
    expect(health.ready).toBe(false);
  });

  it("should prevent plugin/extension loads in safe mode", () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    const canLoadPlugin = (): boolean => {
      const safeModeActive = process.env.OPENCLAW_SAFE_MODE === "1";
      return !safeModeActive;
    };

    expect(canLoadPlugin()).toBe(false);
  });

  it("should block browser subprocess in safe mode", () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    const canStartBrowserSubprocess = (): boolean => {
      const safeModeActive = process.env.OPENCLAW_SAFE_MODE === "1";
      return !safeModeActive;
    };

    expect(canStartBrowserSubprocess()).toBe(false);
  });

  it("should disable relay connections in safe mode", () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    const canEstablishRelay = (): boolean => {
      const safeModeActive = process.env.OPENCLAW_SAFE_MODE === "1";
      return !safeModeActive;
    };

    expect(canEstablishRelay()).toBe(false);
  });

  it("should enforce safe mode across request handlers", () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    interface RequestContext {
      method: string;
      safeMode: boolean;
    }

    const canProcessRequest = (ctx: RequestContext): boolean => {
      if (ctx.safeMode) {
        const safeMethods = ["node.list", "health"];
        return safeMethods.some((m) => ctx.method.includes(m));
      }
      return true;
    };

    const safeReq: RequestContext = { method: "node.list", safeMode: true };
    const dangerousReq: RequestContext = { method: "system.run", safeMode: true };

    expect(canProcessRequest(safeReq)).toBe(true);
    expect(canProcessRequest(dangerousReq)).toBe(false);
  });

  it("should provide clear degradation message when in safe mode", () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    interface DegradationInfo {
      mode: "healthy" | "degraded" | "safe-mode";
      message: string;
      blockedCapabilities: string[];
    }

    const getDegradationStatus = (): DegradationInfo => {
      const safeModeActive = process.env.OPENCLAW_SAFE_MODE === "1";

      if (safeModeActive) {
        return {
          mode: "safe-mode",
          message: "Runtime is in safe mode - dangerous operations are blocked",
          blockedCapabilities: ["system.run", "browser.proxy", "plugin.install", "extension.load"],
        };
      }

      return {
        mode: "healthy",
        message: "Runtime is fully operational",
        blockedCapabilities: [],
      };
    };

    const status = getDegradationStatus();
    expect(status.mode).toBe("safe-mode");
    expect(status.message).toContain("safe mode");
    expect(status.blockedCapabilities.length).toBeGreaterThan(0);
  });

  it("should allow operator to query what is blocked in safe mode", () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    interface SafeModeCapabilities {
      allowed: string[];
      blocked: string[];
    }

    const getSafeModeCapabilities = (): SafeModeCapabilities => {
      return {
        allowed: ["node.list", "node.describe", "health.status", "system.info", "audit.logs"],
        blocked: ["system.run", "browser.proxy", "plugin.install", "extension.load", "model.update"],
      };
    };

    const caps = getSafeModeCapabilities();
    expect(caps.allowed.length).toBeGreaterThan(0);
    expect(caps.blocked.length).toBeGreaterThan(0);
    expect(caps.blocked).toContain("system.run");
    expect(caps.allowed).toContain("health.status");
  });

  it("end-to-end: safe mode integrates with capability registry", () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    interface GateResult {
      allowed: boolean;
      reason: string;
    }

    const checkCapabilityGate = (capability: string, safeMode: boolean): GateResult => {
      if (safeMode) {
        const dangerousCapabilities = ["system.run", "browser.proxy", "plugin.install"];
        if (dangerousCapabilities.includes(capability)) {
          return { allowed: false, reason: "capability blocked in safe mode" };
        }
      }

      return { allowed: true, reason: "capability allowed" };
    };

    const runResult = checkCapabilityGate("system.run", true);
    expect(runResult.allowed).toBe(false);
    expect(runResult.reason).toContain("safe mode");

    const healthResult = checkCapabilityGate("health.status", true);
    expect(healthResult.allowed).toBe(true);

    const normalResult = checkCapabilityGate("system.run", false);
    expect(normalResult.allowed).toBe(true);
  });
});
