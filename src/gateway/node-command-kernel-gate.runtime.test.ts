import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { NodeRegistry, NodeSession, NodeInvokeResult } from "./node-registry.js";
import { invokeNodeCommandWithKernelGate } from "./node-command-kernel-gate.js";
import { DEFAULT_DANGEROUS_NODE_COMMANDS } from "./node-command-policy.js";

/**
 * Integration test: Node-command kernel gating
 *
 * Proves that dangerous node commands are properly denied when:
 * 1. Safe mode is enabled (OPENCLAW_SAFE_MODE=1) — removes dangerous from allowlist
 * 2. Gateway is exposed (not loopback/tailscale serve) and no override
 * 3. Command is not explicitly allowed via policy
 *
 * Proves that allowed commands execute successfully through the gate.
 */
describe("node-command kernel gate (runtime integration)", () => {
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

  it("should block dangerous command when allowlist removes it due to safe mode", async () => {
    // Safe mode is OFF initially
    delete process.env.OPENCLAW_SAFE_MODE;

    const mockNode: NodeSession = {
      nodeId: "node-1",
      platform: "macos",
      commands: ["system.run", "system.notify"],
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
      gateway: {
        bind: "loopback",
        nodes: {
          allowCommands: ["system.run", "system.notify"],
        },
      },
    };

    // Without safe mode, dangerous command should work
    const normalResult = await invokeNodeCommandWithKernelGate({
      cfg,
      nodeRegistry: mockRegistry,
      nodeId: "node-1",
      command: "system.run",
    });
    expect(normalResult.ok).toBe(true);

    // Now enable safe mode
    process.env.OPENCLAW_SAFE_MODE = "1";

    // Same command should now be blocked (dangerous commands removed from allowlist in policy)
    const safeResult = await invokeNodeCommandWithKernelGate({
      cfg,
      nodeRegistry: mockRegistry,
      nodeId: "node-1",
      command: "system.run",
    });
    expect(safeResult.ok).toBe(false);
    // Safe mode causes the command to not be in allowlist anymore
    expect(safeResult.details?.reason).toContain("requires explicit gateway.nodes.allowCommands");
  });

  it("should deny dangerous commands on exposed gateway without override", async () => {
    // Safe mode is OFF, but gateway is exposed
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
        bind: "0.0.0.0", // exposed
        nodes: {
          allowCommands: ["system.run"], // Explicitly allow to reach exposure check
        },
      },
    };

    const result = await invokeNodeCommandWithKernelGate({
      cfg,
      nodeRegistry: mockRegistry,
      nodeId: "node-1",
      command: "system.run",
      commandParams: { cmd: "ls" },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOT_ALLOWED");
    expect(result.message).toContain("dangerous node commands require loopback");
    expect(result.details?.reason).toBe("dangerous command blocked on exposed gateway");
    expect(mockRegistry.invoke).not.toHaveBeenCalled();
  });

  it("should allow dangerous commands on exposed gateway with override", async () => {
    // Safe mode is OFF, gateway is exposed, but override is set
    delete process.env.OPENCLAW_SAFE_MODE;
    process.env.OPENCLAW_ALLOW_DANGEROUS_EXPOSED = "1";

    const mockNode: NodeSession = {
      nodeId: "node-1",
      platform: "macos",
      commands: ["system.run"],
      metadata: {},
    };

    const mockInvokeResult: NodeInvokeResult = {
      ok: true,
      data: { output: "file1\nfile2" },
    };

    const mockRegistry: Pick<NodeRegistry, "get" | "invoke"> = {
      get: vi.fn().mockReturnValue(mockNode),
      invoke: vi.fn().mockResolvedValue(mockInvokeResult),
    };

    const cfg: OpenClawConfig = {
      gateway: {
        bind: "0.0.0.0", // exposed
        nodes: {
          allowCommands: ["system.run"],
        },
      },
    };

    const result = await invokeNodeCommandWithKernelGate({
      cfg,
      nodeRegistry: mockRegistry,
      nodeId: "node-1",
      command: "system.run",
      commandParams: { cmd: "ls" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.ok).toBe(true);
    }
    expect(mockRegistry.invoke).toHaveBeenCalled();
  });

  it("should allow dangerous commands on loopback gateway without override", async () => {
    delete process.env.OPENCLAW_SAFE_MODE;

    const mockNode: NodeSession = {
      nodeId: "node-1",
      platform: "macos",
      commands: ["system.run"],
      metadata: {},
    };

    const mockInvokeResult: NodeInvokeResult = {
      ok: true,
      data: { output: "executed" },
    };

    const mockRegistry: Pick<NodeRegistry, "get" | "invoke"> = {
      get: vi.fn().mockReturnValue(mockNode),
      invoke: vi.fn().mockResolvedValue(mockInvokeResult),
    };

    const cfg: OpenClawConfig = {
      gateway: {
        bind: "loopback",
        nodes: {
          allowCommands: ["system.run"],
        },
      },
    };

    const result = await invokeNodeCommandWithKernelGate({
      cfg,
      nodeRegistry: mockRegistry,
      nodeId: "node-1",
      command: "system.run",
      commandParams: { cmd: "ls" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.ok).toBe(true);
    }
    expect(mockRegistry.invoke).toHaveBeenCalled();
  });

  it("should allow dangerous commands on tailscale serve gateway", async () => {
    delete process.env.OPENCLAW_SAFE_MODE;

    const mockNode: NodeSession = {
      nodeId: "node-1",
      platform: "macos",
      commands: ["system.run"],
      metadata: {},
    };

    const mockInvokeResult: NodeInvokeResult = {
      ok: true,
      data: { output: "executed" },
    };

    const mockRegistry: Pick<NodeRegistry, "get" | "invoke"> = {
      get: vi.fn().mockReturnValue(mockNode),
      invoke: vi.fn().mockResolvedValue(mockInvokeResult),
    };

    const cfg: OpenClawConfig = {
      gateway: {
        bind: "0.0.0.0",
        tailscale: {
          mode: "serve",
        },
        nodes: {
          allowCommands: ["system.run"],
        },
      },
    };

    const result = await invokeNodeCommandWithKernelGate({
      cfg,
      nodeRegistry: mockRegistry,
      nodeId: "node-1",
      command: "system.run",
      commandParams: { cmd: "ls" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.ok).toBe(true);
    }
    expect(mockRegistry.invoke).toHaveBeenCalled();
  });

  it("should deny commands for non-existent nodes", async () => {
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
      command: "system.run",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOT_CONNECTED");
    expect(mockRegistry.invoke).not.toHaveBeenCalled();
  });

  it("should deny commands not in node allowlist (non-dangerous)", async () => {
    const mockNode: NodeSession = {
      nodeId: "node-1",
      platform: "linux",
      commands: ["system.notify"], // only safe command
      metadata: {},
    };

    const mockRegistry: Pick<NodeRegistry, "get" | "invoke"> = {
      get: vi.fn().mockReturnValue(mockNode),
      invoke: vi.fn(),
    };

    const cfg: OpenClawConfig = {
      gateway: { bind: "loopback" },
      // No allowCommands specified, so only defaults are available
    };

    // Try a safe command that's not in linux default allowlist
    const result = await invokeNodeCommandWithKernelGate({
      cfg,
      nodeRegistry: mockRegistry,
      nodeId: "node-1",
      command: "camera.list", // Not in linux default allowlist
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOT_ALLOWED");
    expect(result.message).toContain("not allowlisted");
    expect(mockRegistry.invoke).not.toHaveBeenCalled();
  });

  it("should allow safe commands through the gate", async () => {
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
      gateway: { bind: "0.0.0.0" }, // exposed, but command is safe
    };

    const result = await invokeNodeCommandWithKernelGate({
      cfg,
      nodeRegistry: mockRegistry,
      nodeId: "node-1",
      command: "system.notify",
      commandParams: { message: "hello" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.ok).toBe(true);
    }
    expect(mockRegistry.invoke).toHaveBeenCalled();
  });

  it("should pass through command params to node registry", async () => {
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

    const commandParams = { message: "test notification" };

    await invokeNodeCommandWithKernelGate({
      cfg,
      nodeRegistry: mockRegistry,
      nodeId: "node-1",
      command: "system.notify",
      commandParams,
      timeoutMs: 5000,
    });

    expect(mockRegistry.invoke).toHaveBeenCalledWith({
      nodeId: "node-1",
      command: "system.notify",
      params: commandParams,
      timeoutMs: 5000,
      idempotencyKey: undefined,
    });
  });

  it("should deny all dangerous commands when safe mode is explicitly enabled in config", async () => {
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
        // Note: even if allowCommands includes dangerous commands,
        // safe mode will remove them from the allowlist in resolveNodeCommandAllowlist
        nodes: {
          allowCommands: DEFAULT_DANGEROUS_NODE_COMMANDS,
        },
      },
    };

    // Test a few different dangerous commands
    const dangerousCommandsToTest = [
      "system.run",
      "browser.proxy",
      "camera.snap",
      "sms.send",
    ];

    for (const cmd of dangerousCommandsToTest) {
      if (!DEFAULT_DANGEROUS_NODE_COMMANDS.includes(cmd)) {
        continue; // Skip if not in default dangerous list
      }

      const result = await invokeNodeCommandWithKernelGate({
        cfg,
        nodeRegistry: mockRegistry,
        nodeId: "node-1",
        command: cmd,
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe("NOT_ALLOWED");
      // Safe mode removes dangerous commands from allowlist during policy resolution
      expect(result.details?.reason).toContain("requires explicit");
    }
  });

  it("end-to-end: safe mode prevents dangerous operations in real flow", async () => {
    // Safe mode prevents dangerous commands from being in the allowlist
    process.env.OPENCLAW_SAFE_MODE = "1";

    const mockNode: NodeSession = {
      nodeId: "local-node",
      platform: "macos",
      commands: ["system.run", "system.notify"],
      metadata: {},
    };

    const mockInvokeResult: NodeInvokeResult = {
      ok: true,
      data: { output: "result" },
    };

    const mockRegistry: Pick<NodeRegistry, "get" | "invoke"> = {
      get: vi.fn().mockReturnValue(mockNode),
      invoke: vi.fn().mockResolvedValue(mockInvokeResult),
    };

    const cfg: OpenClawConfig = {
      gateway: {
        bind: "loopback",
        nodes: {
          allowCommands: ["system.run", "system.notify"],
        },
      },
    };

    // Dangerous command should be blocked (removed from allowlist by safe mode)
    const dangerousResult = await invokeNodeCommandWithKernelGate({
      cfg,
      nodeRegistry: mockRegistry,
      nodeId: "local-node",
      command: "system.run",
      commandParams: { cmd: "whoami" },
    });

    expect(dangerousResult.ok).toBe(false);
    expect(dangerousResult.code).toBe("NOT_ALLOWED");

    // Safe command should still work
    const safeResult = await invokeNodeCommandWithKernelGate({
      cfg,
      nodeRegistry: mockRegistry,
      nodeId: "local-node",
      command: "system.notify",
      commandParams: { message: "still working" },
    });

    expect(safeResult.ok).toBe(true);
    if (safeResult.ok) {
      expect(safeResult.result.ok).toBe(true);
    }

    // Verify invoke was only called for safe command
    expect(mockRegistry.invoke).toHaveBeenCalledTimes(1);
  });
});
