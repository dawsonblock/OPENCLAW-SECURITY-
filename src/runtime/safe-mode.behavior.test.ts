import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { NodeInvokeResult, NodeRegistry, NodeSession } from "../gateway/node-registry.js";
import { invokeNodeCommandWithKernelGate } from "../gateway/node-command-kernel-gate.js";
import { resolveStartupBindOverride } from "../security/startup-validator.js";

/**
 * Safe mode proof for guarantees the runtime actually enforces today:
 * - startup bind is forced to loopback and host override is cleared
 * - dangerous node commands are denied by the kernel gate
 */
describe("safe-mode behavior", () => {
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

  it("forces loopback bind and clears host override at startup", () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    expect(
      resolveStartupBindOverride({
        bind: "0.0.0.0",
        host: "192.168.1.25",
        env: process.env,
      }),
    ).toEqual({
      bind: "loopback",
      host: undefined,
    });
  });

  it("blocks dangerous node commands but still allows safe commands", async () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    const mockNode: NodeSession = {
      nodeId: "node-1",
      platform: "macos",
      commands: ["system.run", "system.notify"],
      metadata: {},
    };
    const invokeResult: NodeInvokeResult = {
      ok: true,
      data: { delivered: true },
    };
    const nodeRegistry: Pick<NodeRegistry, "get" | "invoke"> = {
      get: vi.fn().mockReturnValue(mockNode),
      invoke: vi.fn().mockResolvedValue(invokeResult),
    };
    const cfg: OpenClawConfig = {
      gateway: {
        bind: "loopback",
        nodes: {
          allowCommands: ["system.run"],
        },
      },
    };

    const blocked = await invokeNodeCommandWithKernelGate({
      cfg,
      nodeRegistry,
      nodeId: "node-1",
      command: "system.run",
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.details?.reason).toContain("requires explicit gateway.nodes.allowCommands");

    const allowed = await invokeNodeCommandWithKernelGate({
      cfg,
      nodeRegistry,
      nodeId: "node-1",
      command: "system.notify",
    });
    expect(allowed.ok).toBe(true);
    expect(nodeRegistry.invoke).toHaveBeenCalledTimes(1);
  });
});
