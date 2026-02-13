import { describe, expect, test, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { NodeInvokeResult, NodeSession } from "./node-registry.js";
import { invokeNodeCommandWithKernelGate } from "./node-command-kernel-gate.js";

function buildNodeSession(overrides?: Partial<NodeSession>): NodeSession {
  return {
    nodeId: "node-1",
    connId: "conn-1",
    client: {} as NodeSession["client"],
    displayName: "node",
    platform: "ios",
    version: "1.0.0",
    coreVersion: "1.0.0",
    uiVersion: "1.0.0",
    deviceFamily: "ios",
    modelIdentifier: "iPhone",
    remoteIp: "127.0.0.1",
    caps: [],
    commands: [],
    permissions: {},
    pathEnv: "/usr/bin",
    connectedAtMs: Date.now(),
    ...overrides,
  };
}

function baseCfg(): OpenClawConfig {
  return {
    gateway: {},
  } as OpenClawConfig;
}

describe("invokeNodeCommandWithKernelGate", () => {
  test("denies unknown nodes", async () => {
    const result = await invokeNodeCommandWithKernelGate({
      cfg: baseCfg(),
      nodeRegistry: {
        get: vi.fn(() => undefined),
        invoke: vi.fn(),
      },
      nodeId: "missing",
      command: "system.execApprovals.get",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_CONNECTED");
    }
  });

  test("denies commands that are not allowlisted", async () => {
    const node = buildNodeSession({ commands: ["system.execApprovals.get"] });
    const invoke = vi.fn<
      [
        {
          nodeId: string;
          command: string;
          params?: unknown;
          timeoutMs?: number;
          idempotencyKey?: string;
        },
      ],
      Promise<NodeInvokeResult>
    >(async () => ({ ok: true }));

    const result = await invokeNodeCommandWithKernelGate({
      cfg: baseCfg(),
      nodeRegistry: {
        get: vi.fn(() => node),
        invoke,
      },
      nodeId: node.nodeId,
      command: "system.execApprovals.get",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_ALLOWED");
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  test("invokes command when allowlisted and declared", async () => {
    const command = "system.execApprovals.get";
    const node = buildNodeSession({ commands: [command] });
    const invoke = vi.fn<
      [
        {
          nodeId: string;
          command: string;
          params?: unknown;
          timeoutMs?: number;
          idempotencyKey?: string;
        },
      ],
      Promise<NodeInvokeResult>
    >(async () => ({ ok: true, payload: { ok: true } }));

    const cfg = {
      gateway: {
        nodes: {
          allowCommands: [command],
        },
      },
    } as OpenClawConfig;

    const result = await invokeNodeCommandWithKernelGate({
      cfg,
      nodeRegistry: {
        get: vi.fn(() => node),
        invoke,
      },
      nodeId: node.nodeId,
      command,
      commandParams: { sample: true },
    });

    expect(result.ok).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  test("blocks dangerous commands when gateway exposure is unsafe", async () => {
    const command = "system.run";
    const node = buildNodeSession({ commands: [command], platform: "macos", deviceFamily: "Mac" });
    const invoke = vi.fn<
      [
        {
          nodeId: string;
          command: string;
          params?: unknown;
          timeoutMs?: number;
          idempotencyKey?: string;
        },
      ],
      Promise<NodeInvokeResult>
    >(async () => ({ ok: true, payload: { ok: true } }));

    const cfg = {
      gateway: {
        bind: "lan",
        nodes: {
          allowCommands: [command],
        },
      },
    } as OpenClawConfig;

    const result = await invokeNodeCommandWithKernelGate({
      cfg,
      nodeRegistry: {
        get: vi.fn(() => node),
        invoke,
      },
      nodeId: node.nodeId,
      command,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_ALLOWED");
      expect(result.message).toContain("dangerous node commands require loopback exposure");
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  test("allows dangerous commands on exposed gateway with break-glass override", async () => {
    const command = "system.run";
    const node = buildNodeSession({ commands: [command], platform: "macos", deviceFamily: "Mac" });
    const invoke = vi.fn<
      [
        {
          nodeId: string;
          command: string;
          params?: unknown;
          timeoutMs?: number;
          idempotencyKey?: string;
        },
      ],
      Promise<NodeInvokeResult>
    >(async () => ({ ok: true, payload: { ok: true } }));

    const cfg = {
      gateway: {
        bind: "lan",
        nodes: {
          allowCommands: [command],
        },
      },
    } as OpenClawConfig;

    const previous = process.env.OPENCLAW_ALLOW_DANGEROUS_EXPOSED;
    process.env.OPENCLAW_ALLOW_DANGEROUS_EXPOSED = "1";

    try {
      const result = await invokeNodeCommandWithKernelGate({
        cfg,
        nodeRegistry: {
          get: vi.fn(() => node),
          invoke,
        },
        nodeId: node.nodeId,
        command,
      });

      expect(result.ok).toBe(true);
      expect(invoke).toHaveBeenCalledTimes(1);
    } finally {
      if (previous === undefined) {
        delete process.env.OPENCLAW_ALLOW_DANGEROUS_EXPOSED;
      } else {
        process.env.OPENCLAW_ALLOW_DANGEROUS_EXPOSED = previous;
      }
    }
  });

  test("blocks dangerous commands when safe mode is enabled", async () => {
    const command = "system.run";
    const node = buildNodeSession({ commands: [command], platform: "macos", deviceFamily: "Mac" });
    const invoke = vi.fn<
      [
        {
          nodeId: string;
          command: string;
          params?: unknown;
          timeoutMs?: number;
          idempotencyKey?: string;
        },
      ],
      Promise<NodeInvokeResult>
    >(async () => ({ ok: true, payload: { ok: true } }));
    const previous = process.env.OPENCLAW_SAFE_MODE;
    process.env.OPENCLAW_SAFE_MODE = "1";
    try {
      const result = await invokeNodeCommandWithKernelGate({
        cfg: {
          gateway: {
            bind: "loopback",
            nodes: { allowCommands: [command] },
          },
        } as OpenClawConfig,
        nodeRegistry: {
          get: vi.fn(() => node),
          invoke,
        },
        nodeId: node.nodeId,
        command,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("node command not allowed");
      }
      expect(invoke).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) {
        delete process.env.OPENCLAW_SAFE_MODE;
      } else {
        process.env.OPENCLAW_SAFE_MODE = previous;
      }
    }
  });
});
