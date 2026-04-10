import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { NodeInvokeResult, NodeRegistry, NodeSession } from "../gateway/node-registry.js";
import { invokeNodeCommandWithKernelGate } from "../gateway/node-command-kernel-gate.js";
import { healthHandlers } from "../gateway/server-methods/health.js";
import { installGatewayTestHooks } from "../gateway/test-helpers.js";
import { ensureMediaDir } from "../media/store.js";
import { readBrowserProxyFile } from "../node-host/browser-proxy.js";
import { scanAuthorityBoundaryImporters } from "../security/authority-boundary-importers.js";
import { resolveStartupBindOverride } from "../security/startup-validator.js";
import { RecoveryManager } from "./recovery.js";

installGatewayTestHooks();

describe("runtime truth smoke", () => {
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

  it("passes the authority-boundary importer scan", async () => {
    const result = await scanAuthorityBoundaryImporters();

    expect(result.unexpectedImporters).toEqual([]);
    expect(result.forbiddenImporters).toEqual([]);
  });

  it("denies a dangerous node command in a live kernel-gate flow", async () => {
    process.env.OPENCLAW_SAFE_MODE = "1";

    const node: NodeSession = {
      nodeId: "node-1",
      platform: "macos",
      commands: ["system.run"],
      metadata: {},
    };
    const nodeRegistry: Pick<NodeRegistry, "get" | "invoke"> = {
      get: vi.fn().mockReturnValue(node),
      invoke: vi.fn(),
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
      nodeRegistry,
      nodeId: "node-1",
      command: "system.run",
    });

    expect(result.ok).toBe(false);
    expect(result.details?.reason).toContain("requires explicit gateway.nodes.allowCommands");
  });

  it("rejects an outside-root browser-proxy escape through the live file boundary", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-runtime-truth-browser-"));
    const mediaDir = await ensureMediaDir();
    const allowedDir = path.join(mediaDir, `runtime-truth-${Date.now()}`);
    const outsideFile = path.join(tempDir, "outside-root.txt");
    const escapeSymlink = path.join(allowedDir, "escape-link.txt");

    await fs.mkdir(allowedDir, { recursive: true });
    await fs.writeFile(outsideFile, "outside-root", "utf8");
    await fs.symlink(outsideFile, escapeSymlink);

    try {
      await expect(readBrowserProxyFile(escapeSymlink)).rejects.toThrow(/outside approved roots/);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      await fs.rm(allowedDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("reports runtime health through the canonical gateway method", async () => {
    let response:
      | {
          ok: boolean;
          payload?: {
            alive?: boolean;
            ready?: boolean;
            degraded?: boolean;
            safeMode?: boolean;
            status?: string;
          };
        }
      | undefined;

    await healthHandlers.health({
      req: { type: "req", id: "health-smoke", method: "health" },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond: (ok, payload) => {
        response = {
          ok,
          payload: payload as {
            alive?: boolean;
            ready?: boolean;
            degraded?: boolean;
            safeMode?: boolean;
            status?: string;
          },
        };
      },
      context: {
        getHealthCache: () => null,
        refreshHealthSnapshot: async () => ({
          alive: true,
          ready: true,
          degraded: false,
          safeMode: false,
          status: "healthy",
        }),
        logHealth: { error: () => {} },
      } as any,
    });

    expect(response?.ok).toBe(true);
    expect(response?.payload?.alive).toBe(true);
    expect(typeof response?.payload?.ready).toBe("boolean");
    expect(typeof response?.payload?.degraded).toBe("boolean");
    expect(typeof response?.payload?.safeMode).toBe("boolean");
    expect(["healthy", "degraded", "unhealthy"]).toContain(String(response?.payload?.status));
  });

  it("matches the documented safe-mode scope for startup and health", async () => {
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

    let response:
      | {
          ok: boolean;
          payload?: { safeMode?: boolean; runtime?: { safeMode?: boolean } };
        }
      | undefined;

    await healthHandlers.health({
      req: { type: "req", id: "health-safe-smoke", method: "health" },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond: (ok, payload) => {
        response = {
          ok,
          payload: payload as { safeMode?: boolean; runtime?: { safeMode?: boolean } },
        };
      },
      context: {
        getHealthCache: () => null,
        refreshHealthSnapshot: async () => ({
          safeMode: true,
          runtime: { safeMode: true },
        }),
        logHealth: { error: () => {} },
      } as never,
    });

    expect(response?.ok).toBe(true);
    expect(response?.payload?.safeMode).toBe(true);
    expect(response?.payload?.runtime?.safeMode).toBe(true);
  });

  it("restores config from .bak and generates a sanitized lightweight recovery report", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-runtime-truth-recovery-"));
    const configPath = path.join(tempDir, "config.json");
    const backupPath = `${configPath}.bak`;

    await fs.writeFile(configPath, JSON.stringify({ mode: "broken" }), "utf8");
    await fs.writeFile(backupPath, JSON.stringify({ mode: "backup" }), "utf8");
    process.env.OPENCLAW_API_KEY = "sk-secret";

    const previousCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const recovery = new RecoveryManager(configPath);
      recovery.triggerSafeMode("runtime-smoke");
      const restored = JSON.parse(await fs.readFile(configPath, "utf8")) as { mode: string };
      const report = recovery.generateReport("runtime-smoke");

      expect(restored.mode).toBe("backup");
      expect(report.environmentSnapshot.OPENCLAW_API_KEY).toBe("[REDACTED]");
      expect(report.configDiff.toLowerCase()).toContain("not implemented");
    } finally {
      process.chdir(previousCwd);
      delete process.env.OPENCLAW_API_KEY;
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
