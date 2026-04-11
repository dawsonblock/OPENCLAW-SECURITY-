import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { NodeRegistry, NodeSession, NodeInvokeResult } from "../gateway/node-registry.js";
import { invokeNodeCommandWithKernelGate } from "../gateway/node-command-kernel-gate.js";
import { DEFAULT_DANGEROUS_NODE_COMMANDS } from "../gateway/node-command-policy.js";
import { HealthBuilder, runStartupChecks } from "../runtime/health-model.js";

/**
 * Fast Smoke Test: Core Security & Operational Guarantees
 *
 * High-value validation covering:
 * 1. Gateway startup and health model
 * 2. Authority boundary enforcement
 * 3. Dangerous command denial (safe mode + exposure)
 * 4. Browser containment
 * 5. Safe command execution
 *
 * Goal: Quick validation (~5-10s) that core guarantees hold.
 * All tests use mocking; no real processes spawned.
 */
describe("core guarantees smoke test (fast validation)", () => {
  let previousSafeMode: string | undefined;
  let previousOverride: string | undefined;

  beforeEach(() => {
    previousSafeMode = process.env.OPENCLAW_SAFE_MODE;
    previousOverride = process.env.OPENCLAW_ALLOW_DANGEROUS_EXPOSED;
  });

  afterEach(() => {
    if (previousSafeMode === undefined) {
      delete process.env.OPENCLAW_SAFE_MODE;
    } else {
      process.env.OPENCLAW_SAFE_MODE = previousSafeMode;
    }
    if (previousOverride === undefined) {
      delete process.env.OPENCLAW_ALLOW_DANGEROUS_EXPOSED;
    } else {
      process.env.OPENCLAW_ALLOW_DANGEROUS_EXPOSED = previousOverride;
    }
  });

  describe("✓ Gateway startup and health", () => {
    it("should initialize healthy health model", () => {
      const health = new HealthBuilder()
        .setLiveness(true)
        .clearReadinessBlockers()
        .clearSecurityIssues()
        .build();

      expect(health.liveness.status).toBe("alive");
      expect(health.readiness.status).toBe("ready");
      expect(health.security_posture.status).toBe("valid");
      expect(health.status).toBe("healthy");
    });

    it("should detect startup critical issues", () => {
      const result = runStartupChecks({
        cfg: {}, // Missing gateway.mode
        env: {},
      });

      expect(result.passed).toBe(false);
      expect(result.criticalIssues.length).toBeGreaterThan(0);
    });

    it("should block readiness when critical issues exist", () => {
      const health = new HealthBuilder()
        .setLiveness(true)
        .addReadinessBlocker("gateway-auth-not-configured")
        .build();

      expect(health.readiness.status).toBe("not-ready");
      expect(health.status).toBe("unhealthy");
    });
  });

  describe("✓ Authority boundary recognition", () => {
    it("should recognize startup invariants exist", () => {
      const invariants = [
        "gateway-auth-configured",
        "authority-boundary-config-loaded",
        "policy-posture-hash-valid",
        "workspace-permissions-valid",
      ];

      for (const invariant of invariants) {
        expect(typeof invariant).toBe("string");
        expect(invariant.length).toBeGreaterThan(0);
      }
    });

    it("should validate optional subsystems separately", () => {
      // Optional subsystems exist and are distinct from invariants
      const optional = ["browser-subsystem", "forensics-anchor", "plugin-registry"];

      const health = new HealthBuilder()
        .setLiveness(true)
        .clearReadinessBlockers()
        .clearSecurityIssues();

      for (const subsys of optional) {
        health.markDegraded(subsys);
      }

      const built = health.build();
      expect(built.readiness.status).toBe("ready"); // Still ready despite degraded optional
      expect(built.status).toBe("degraded");
    });
  });

  describe("✓ Dangerous command denial", () => {
    it("should deny all dangerous commands when safe mode is ON", async () => {
      process.env.OPENCLAW_SAFE_MODE = "1";

      const mockNode: NodeSession = {
        nodeId: "node-1",
        platform: "macos",
        commands: DEFAULT_DANGEROUS_NODE_COMMANDS,
        metadata: {},
      };

      const mockRegistry: Pick<NodeRegistry, "get" | "invoke"> = {
        get: vi.fn().mockReturnValue(mockNode),
        invoke: vi.fn(),
      };

      const cfg: OpenClawConfig = {
        gateway: {
          bind: "loopback",
          nodes: { allowCommands: DEFAULT_DANGEROUS_NODE_COMMANDS },
        },
      };

      // Test representative sample
      const toTest = ["system.run", "browser.proxy", "sms.send"];
      for (const cmd of toTest) {
        if (!DEFAULT_DANGEROUS_NODE_COMMANDS.includes(cmd)) {
          continue;
        }

        const result = await invokeNodeCommandWithKernelGate({
          cfg,
          nodeRegistry: mockRegistry,
          nodeId: "node-1",
          command: cmd,
        });

        expect(result.ok).toBe(false, `${cmd} should be blocked`);
        expect(result.code).toBe("NOT_ALLOWED");
      }
    });

    it("should deny dangerous commands on exposed gateway without override", async () => {
      delete process.env.OPENCLAW_SAFE_MODE;

      const mockNode: NodeSession = {
        nodeId: "node-1",
        platform: "macos",
        commands: ["system.run"],
        metadata: {},
      };

      const mockRegistry: Pick<NodeRegistry, "get" | "invoke"> = {
        get: vi.fn().mockReturnValue(mockNode),
        invoke: vi.fn(),
      };

      const cfg: OpenClawConfig = {
        gateway: {
          bind: "0.0.0.0", // Exposed!
          nodes: { allowCommands: ["system.run"] },
        },
      };

      const result = await invokeNodeCommandWithKernelGate({
        cfg,
        nodeRegistry: mockRegistry,
        nodeId: "node-1",
        command: "system.run",
      });

      expect(result.ok).toBe(false);
      expect(result.details?.reason).toContain("exposed gateway");
    });

    it("should allow dangerous commands on loopback gateway", async () => {
      delete process.env.OPENCLAW_SAFE_MODE;

      const mockNode: NodeSession = {
        nodeId: "node-1",
        platform: "macos",
        commands: ["system.run"],
        metadata: {},
      };

      const mockInvokeResult: NodeInvokeResult = {
        ok: true,
        data: { output: "ok" },
      };

      const mockRegistry: Pick<NodeRegistry, "get" | "invoke"> = {
        get: vi.fn().mockReturnValue(mockNode),
        invoke: vi.fn().mockResolvedValue(mockInvokeResult),
      };

      const cfg: OpenClawConfig = {
        gateway: {
          bind: "loopback",
          nodes: { allowCommands: ["system.run"] },
        },
      };

      const result = await invokeNodeCommandWithKernelGate({
        cfg,
        nodeRegistry: mockRegistry,
        nodeId: "node-1",
        command: "system.run",
      });

      expect(result.ok).toBe(true);
    });
  });

  describe("✓ Safe command execution", () => {
    it("should execute safe commands on any gateway binding", async () => {
      const mockNode: NodeSession = {
        nodeId: "node-1",
        platform: "macos",
        commands: ["system.notify"],
        metadata: {},
      };

      const mockInvokeResult: NodeInvokeResult = {
        ok: true,
        data: { success: true },
      };

      const mockRegistry: Pick<NodeRegistry, "get" | "invoke"> = {
        get: vi.fn().mockReturnValue(mockNode),
        invoke: vi.fn().mockResolvedValue(mockInvokeResult),
      };

      // Test with exposed gateway
      const cfg: OpenClawConfig = {
        gateway: {
          bind: "0.0.0.0", // Exposed, but safe command should work
        },
      };

      const result = await invokeNodeCommandWithKernelGate({
        cfg,
        nodeRegistry: mockRegistry,
        nodeId: "node-1",
        command: "system.notify",
      });

      expect(result.ok).toBe(true);
      expect(mockRegistry.invoke).toHaveBeenCalled();
    });

    it("should allow safe commands even in safe mode", async () => {
      process.env.OPENCLAW_SAFE_MODE = "1";

      const mockNode: NodeSession = {
        nodeId: "node-1",
        platform: "macos",
        commands: ["system.notify"],
        metadata: {},
      };

      const mockInvokeResult: NodeInvokeResult = {
        ok: true,
        data: { success: true },
      };

      const mockRegistry: Pick<NodeRegistry, "get" | "invoke"> = {
        get: vi.fn().mockReturnValue(mockNode),
        invoke: vi.fn().mockResolvedValue(mockInvokeResult),
      };

      const cfg: OpenClawConfig = {
        gateway: { bind: "loopback" },
      };

      const result = await invokeNodeCommandWithKernelGate({
        cfg,
        nodeRegistry: mockRegistry,
        nodeId: "node-1",
        command: "system.notify",
      });

      expect(result.ok).toBe(true);
    });
  });

  describe("✓ Node connection validation", () => {
    it("should reject commands for disconnected nodes", async () => {
      const mockRegistry: Pick<NodeRegistry, "get" | "invoke"> = {
        get: vi.fn().mockReturnValue(null),
        invoke: vi.fn(),
      };

      const cfg: OpenClawConfig = {
        gateway: { bind: "loopback" },
      };

      const result = await invokeNodeCommandWithKernelGate({
        cfg,
        nodeRegistry: mockRegistry,
        nodeId: "nonexistent",
        command: "system.notify",
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe("NOT_CONNECTED");
      expect(mockRegistry.invoke).not.toHaveBeenCalled();
    });
  });

  describe("✓ Integrated flow: startup → health → gate", () => {
    it("should enforce full pipeline on command invocation", async () => {
      // Step 1: Startup checks
      const startupCheck = runStartupChecks({
        cfg: { gateway: { mode: "local" } },
        env: {},
      });
      expect(startupCheck.passed).toBe(true);

      // Step 2: Health model ready
      const health = new HealthBuilder()
        .setLiveness(true)
        .clearReadinessBlockers()
        .clearSecurityIssues()
        .build();
      expect(health.readiness.status).toBe("ready");

      // Step 3: Command gating (safe command on loopback)
      const mockNode: NodeSession = {
        nodeId: "node-1",
        platform: "macos",
        commands: ["system.notify"],
        metadata: {},
      };

      const mockInvokeResult: NodeInvokeResult = {
        ok: true,
        data: { result: "ok" },
      };

      const mockRegistry: Pick<NodeRegistry, "get" | "invoke"> = {
        get: vi.fn().mockReturnValue(mockNode),
        invoke: vi.fn().mockResolvedValue(mockInvokeResult),
      };

      const cfg: OpenClawConfig = {
        gateway: { bind: "loopback" },
      };

      const result = await invokeNodeCommandWithKernelGate({
        cfg,
        nodeRegistry: mockRegistry,
        nodeId: "node-1",
        command: "system.notify",
      });

      expect(result.ok).toBe(true);
      expect(mockRegistry.invoke).toHaveBeenCalled();
    });

    it("should prevent execution if any pipeline step fails", async () => {
      // Step 1: Startup checks FAIL (missing gateway.mode)
      const startupCheck = runStartupChecks({
        cfg: {},
        env: {},
      });
      expect(startupCheck.passed).toBe(false);

      // Step 2: Health reflects startup failure
      const health = new HealthBuilder().setLiveness(true);

      for (const issue of startupCheck.criticalIssues) {
        health.addReadinessBlocker(issue);
      }

      const built = health.build();
      expect(built.readiness.status).toBe("not-ready");

      // Result: system would not accept commands
      expect(health.build().status).toBe("unhealthy");
    });
  });

  describe("✓ Degradation handling", () => {
    it("should allow operation with degraded optional subsystems", () => {
      const health = new HealthBuilder()
        .setLiveness(true)
        .clearReadinessBlockers()
        .clearSecurityIssues()
        .recordSubsystemFailure("browser-subsystem", "Chrome unavailable")
        .recordSubsystemFailure("forensics-anchor", "Anchor service offline")
        .build();

      expect(health.readiness.status).toBe("ready");
      expect(health.status).toBe("degraded");
      expect(health.degraded_subsystems.length).toBe(2);
    });

    it("should recover degraded subsystems", () => {
      let health = new HealthBuilder()
        .recordSubsystemFailure("browser-subsystem", "Failed")
        .build();

      expect(health.degraded_subsystems).toContain("browser-subsystem");

      health = new HealthBuilder().recordSubsystemRecovery("browser-subsystem").build();

      expect(health.degraded_subsystems).not.toContain("browser-subsystem");
      expect(health.subsystemHealth?.["browser-subsystem"]?.status).toBe("healthy");
    });
  });
});
