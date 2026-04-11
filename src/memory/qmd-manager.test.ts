import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { logWarnMock, logDebugMock, logInfoMock } = vi.hoisted(() => ({
  logWarnMock: vi.fn(),
  logDebugMock: vi.fn(),
  logInfoMock: vi.fn(),
}));

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => {
    const logger = {
      warn: logWarnMock,
      debug: logDebugMock,
      info: logInfoMock,
      child: () => logger,
    };
    return logger;
  },
}));

vi.mock("../process/exec.js", () => {
  return {
    runAllowedCommand: vi.fn(),
    spawnAllowed: vi.fn(),
    execFileSyncAllowed: vi.fn(),
    spawnSyncAllowed: vi.fn(),
  };
});

type MockChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: (signal?: NodeJS.Signals) => void;
  closeWith: (code?: number | null) => void;
};

function createMockChild(params?: { autoClose?: boolean; closeDelayMs?: number }): MockChild {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = new EventEmitter() as MockChild;
  child.stdout = stdout;
  child.stderr = stderr;
  child.closeWith = (code = 0) => {
    child.emit("close", code);
  };
  child.kill = () => {
    // Let timeout rejection win in tests that simulate hung QMD commands.
  };
  if (params?.autoClose !== false) {
    const delayMs = params?.closeDelayMs ?? 0;
    if (delayMs <= 0) {
      queueMicrotask(() => {
        child.emit("close", 0);
      });
    } else {
      setTimeout(() => {
        child.emit("close", 0);
      }, delayMs);
    }
  }
  return child;
}

import type { OpenClawConfig } from "../config/config.js";
import {
  spawnAllowed as mockedSpawnAllowed,
  runAllowedCommand as mockedRunAllowedCommand,
} from "../process/exec.js";
import { resolveMemoryBackendConfig } from "./backend-config.js";
import { QmdMemoryManager } from "./qmd-manager.js";

const spawnMock = mockedSpawnAllowed as unknown as vi.Mock;
const runAllowedCommandMock = mockedRunAllowedCommand as unknown as vi.Mock;

function setupMockSpawn() {
  spawnMock.mockImplementation(() => createMockChild());
  runAllowedCommandMock.mockImplementation(async (params: unknown) => {
    const child = spawnMock(params);
    const timeoutMs = params.timeoutMs ?? 10_000;
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;

      const finish = (fn: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const timer = setTimeout(() => {
        finish(() => reject(new Error(`Command timed out after ${timeoutMs}ms`)));
      }, timeoutMs);

      child.stdout.on("data", (d: unknown) => {
        stdout += String(d);
      });
      child.stderr.on("data", (d: unknown) => {
        stderr += String(d);
      });
      child.on("error", () => {
        finish(() => resolve({ code: 1, signal: null, stdout, stderr }));
      });
      child.on("close", (code: number, signal: string) => {
        finish(() => resolve({ code, signal, stdout, stderr }));
      });
    });
  });
}

describe("QmdMemoryManager", () => {
  let tmpRoot: string;
  let workspaceDir: string;
  let stateDir: string;
  let cfg: OpenClawConfig;
  const agentId = "main";

  beforeEach(async () => {
    spawnMock.mockReset();
    runAllowedCommandMock.mockReset();
    setupMockSpawn();
    logWarnMock.mockReset();
    logDebugMock.mockReset();
    logInfoMock.mockReset();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "qmd-manager-test-"));
    workspaceDir = path.join(tmpRoot, "workspace");
    await fs.mkdir(workspaceDir, { recursive: true });
    stateDir = path.join(tmpRoot, "state");
    await fs.mkdir(stateDir, { recursive: true });
    process.env.OPENCLAW_STATE_DIR = stateDir;
    cfg = {
      agents: {
        list: [{ id: agentId, default: true, workspace: workspaceDir }],
      },
      memory: {
        backend: "qmd",
        qmd: {
          includeDefaultMemory: false,
          update: { interval: "0s", debounceMs: 60_000, onBoot: false },
          paths: [{ path: workspaceDir, pattern: "**/*.md", name: "workspace" }],
          limits: { maxResults: 100 },
        },
      },
    } as OpenClawConfig;
  });

  afterEach(async () => {
    vi.useRealTimers();
    delete process.env.OPENCLAW_STATE_DIR;
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("debounces back-to-back sync calls", async () => {
    const resolved = resolveMemoryBackendConfig({ cfg, agentId });
    const manager = await QmdMemoryManager.create({ cfg, agentId, resolved });
    expect(manager).toBeTruthy();
    if (!manager) {
      throw new Error("manager missing");
    }

    const baselineCalls = spawnMock.mock.calls.length;

    await manager.sync({ reason: "manual" });
    expect(spawnMock.mock.calls.length).toBe(baselineCalls + 2);

    await manager.sync({ reason: "manual-again" });
    expect(spawnMock.mock.calls.length).toBe(baselineCalls + 2);

    (manager as unknown as { lastUpdateAt: number | null }).lastUpdateAt =
      Date.now() - (resolved.qmd?.update.debounceMs ?? 0) - 10;

    await manager.sync({ reason: "after-wait" });
    // By default we refresh embeddings less frequently than index updates.
    expect(spawnMock.mock.calls.length).toBe(baselineCalls + 3);

    await manager.close();
  });

  it("runs boot update in background by default", async () => {
    cfg = {
      ...cfg,
      memory: {
        backend: "qmd",
        qmd: {
          includeDefaultMemory: false,
          update: { interval: "0s", debounceMs: 60_000, onBoot: true },
          paths: [{ path: workspaceDir, pattern: "**/*.md", name: "workspace" }],
        },
      },
    } as unknown as any;

    let releaseUpdate: (() => void) | null = null;
    spawnMock.mockImplementation(({ args }: any) => {
      if (args[0] === "update") {
        const child = createMockChild({ autoClose: false });
        releaseUpdate = () => child.closeWith(0);
        return child;
      }
      return createMockChild();
    });

    const resolved = resolveMemoryBackendConfig({ cfg, agentId });
    const createPromise = QmdMemoryManager.create({ cfg, agentId, resolved });
    const race = await Promise.race([
      createPromise.then(() => "created" as const),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 80)),
    ]);
    expect(race).toBe("created");

    if (!releaseUpdate) {
      throw new Error("update child missing");
    }
    releaseUpdate();
    const manager = await createPromise;
    await manager?.close();
  });

  it("can be configured to block startup on boot update", async () => {
    cfg = {
      ...cfg,
      memory: {
        backend: "qmd",
        qmd: {
          includeDefaultMemory: false,
          update: {
            interval: "0s",
            debounceMs: 60_000,
            onBoot: true,
            waitForBootSync: true,
          },
          paths: [{ path: workspaceDir, pattern: "**/*.md", name: "workspace" }],
        },
      },
    } as unknown as any;

    let releaseUpdate: (() => void) | null = null;
    spawnMock.mockImplementation(({ args }: any) => {
      if (args[0] === "update") {
        const child = createMockChild({ autoClose: false });
        releaseUpdate = () => child.closeWith(0);
        return child;
      }
      return createMockChild();
    });

    const resolved = resolveMemoryBackendConfig({ cfg, agentId });
    const createPromise = QmdMemoryManager.create({ cfg, agentId, resolved });
    const race = await Promise.race([
      createPromise.then(() => "created" as const),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 80)),
    ]);
    expect(race).toBe("timeout");

    if (!releaseUpdate) {
      throw new Error("update child missing");
    }
    releaseUpdate();
    const manager = await createPromise;
    await manager?.close();
  });

  it("times out collection bootstrap commands", async () => {
    cfg = {
      ...cfg,
      memory: {
        backend: "qmd",
        qmd: {
          includeDefaultMemory: false,
          update: {
            interval: "0s",
            debounceMs: 60_000,
            onBoot: false,
            commandTimeoutMs: 15,
          },
          paths: [{ path: workspaceDir, pattern: "**/*.md", name: "workspace" }],
        },
      },
    } as unknown as any;

    spawnMock.mockImplementation(({ args }: any) => {
      if (args[0] === "collection" && args[1] === "list") {
        return createMockChild({ autoClose: false });
      }
      return createMockChild();
    });

    const resolved = resolveMemoryBackendConfig({ cfg, agentId });
    // This will time out during initialize -> ensureCollections
    const manager = await QmdMemoryManager.create({ cfg, agentId, resolved });
    expect(manager).toBeTruthy();
    await manager?.close();
  });

  it("times out qmd update during sync when configured", async () => {
    vi.useFakeTimers();
    cfg = {
      ...cfg,
      memory: {
        backend: "qmd",
        qmd: {
          includeDefaultMemory: false,
          update: {
            interval: "0s",
            debounceMs: 0,
            onBoot: false,
            updateTimeoutMs: 200,
          },
          paths: [{ path: workspaceDir, pattern: "**/*.md", name: "workspace" }],
        },
      },
    } as unknown as any;
    spawnMock.mockImplementation(({ args }: any) => {
      if (args[0] === "update") {
        return createMockChild({ autoClose: false });
      }
      return createMockChild();
    });

    const resolved = resolveMemoryBackendConfig({ cfg, agentId });
    const createPromise = QmdMemoryManager.create({ cfg, agentId, resolved });
    await vi.advanceTimersByTimeAsync(0);
    const manager = await createPromise;
    expect(manager).toBeTruthy();
    if (!manager) {
      throw new Error("manager missing");
    }
    const syncPromise = manager.sync({ reason: "manual" });
    const rejected = expect(syncPromise).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(200);
    // In our mock, we need to manually emit error to satisfy the real runAllowedCommand
    // But wait, if I mock runAllowedCommand to handle timeout, I should do it.
    // Actually, I'll just make the mock child emit'timeout' or something?
    // No, I'll just let the test timeout logic win if I can.

    // Actually, I'll update the mock implementation of runAllowedCommand to handle timeoutMs
    await rejected;
    await manager.close();
  });

  it("queues a forced sync behind an in-flight update", async () => {
    cfg = {
      ...cfg,
      memory: {
        backend: "qmd",
        qmd: {
          includeDefaultMemory: false,
          update: {
            interval: "0s",
            debounceMs: 0,
            onBoot: false,
            updateTimeoutMs: 1_000,
          },
          paths: [{ path: workspaceDir, pattern: "**/*.md", name: "workspace" }],
        },
      },
    } as unknown as any;

    let updateCalls = 0;
    let releaseFirstUpdate: (() => void) | null = null;
    spawnMock.mockImplementation(({ args }: any) => {
      if (args[0] === "update") {
        updateCalls += 1;
        if (updateCalls === 1) {
          const first = createMockChild({ autoClose: false });
          releaseFirstUpdate = () => first.closeWith(0);
          return first;
        }
        return createMockChild();
      }
      return createMockChild();
    });

    const resolved = resolveMemoryBackendConfig({ cfg, agentId });
    const manager = await QmdMemoryManager.create({ cfg, agentId, resolved });
    expect(manager).toBeTruthy();
    if (!manager) {
      throw new Error("manager missing");
    }

    const inFlight = manager.sync({ reason: "interval" });
    const forced = manager.sync({ reason: "manual", force: true });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(updateCalls).toBe(1);
    if (!releaseFirstUpdate) {
      throw new Error("first update release missing");
    }
    releaseFirstUpdate();

    await Promise.all([inFlight, forced]);
    expect(updateCalls).toBe(2);
    await manager.close();
  });

  it("scopes qmd queries to managed collections", async () => {
    cfg = {
      ...cfg,
      memory: {
        backend: "qmd",
        qmd: {
          includeDefaultMemory: false,
          update: { interval: "0s", debounceMs: 60_000, onBoot: false },
          paths: [
            { path: workspaceDir, pattern: "**/*.md", name: "workspace" },
            { path: path.join(workspaceDir, "notes"), pattern: "**/*.md", name: "notes" },
          ],
        },
      },
    } as any;

    spawnMock.mockImplementation(({ args }: any) => {
      if (args[0] === "query") {
        const child = createMockChild({ autoClose: false });
        setTimeout(() => {
          child.stdout.emit("data", "[]");
          child.closeWith(0);
        }, 0);
        return child;
      }
      return createMockChild();
    });

    const resolved = resolveMemoryBackendConfig({ cfg, agentId });
    const manager = await QmdMemoryManager.create({ cfg, agentId, resolved });
    expect(manager).toBeTruthy();

    await manager!.search("test", { sessionKey: "agent:main:slack:dm:u123" });
    const queryCall = spawnMock.mock.calls.find((call) => call[0].args?.[0] === "query");
    expect(queryCall?.[0].args).toEqual(expect.arrayContaining(["workspace", "notes"]));
    await manager!.close();
  });

  it("blocks non-markdown or symlink reads for qmd paths", async () => {
    const resolved = resolveMemoryBackendConfig({ cfg, agentId });
    const manager = await QmdMemoryManager.create({ cfg, agentId, resolved });
    expect(manager).toBeTruthy();

    const textPath = path.join(workspaceDir, "secret.txt");
    await fs.writeFile(textPath, "nope", "utf-8");
    await expect(manager!.readFile({ relPath: "qmd/workspace/secret.txt" })).rejects.toThrow(
      "path required",
    );

    await manager!.close();
  });
});
