import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

// Mock child process
class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = {
    write: vi.fn(),
    end: vi.fn(),
    destroyed: false,
  };
  pid = 123;
  killed = false;

  kill() {
    this.killed = true;
    this.emit("close", null, "SIGKILL");
  }
}

// Mock spawn-utils
vi.mock("../process/spawn-utils.js", async () => {
  return {
    spawnWithFallback: vi.fn(async () => {
      // Return a process that just hangs until killed (simulating long run)
      return {
        child: new MockChildProcess(),
        usedFallback: false,
      };
    }),
    formatSpawnError: (err: unknown) => String(err),
  };
});

// Mock fs/promises (assertSandboxPath used likely)
vi.mock("node:fs/promises", async (importOriginal) => {
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    stat: vi.fn(async () => ({ isDirectory: () => true })),
  };
});

// Mock sandbox-paths
vi.mock("./sandbox-paths.js", async () => {
  return {
    assertSandboxPath: vi.fn(async ({ filePath }) => ({ resolved: filePath, relative: "" })),
  };
});

describe("exec execution budget", () => {
  it("clamps timeout to budget", async () => {
    const { createExecTool } = await import("./bash-tools.exec.js");
    const tool = createExecTool({
      sandbox: {
        containerName: "test",
        workspaceDir: "/ws",
        containerWorkdir: "/ws",
        executionBudget: { timeoutMs: 500 }, // 0.5s budget
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        docker: { image: "test" } as any,
        tools: { allow: [], deny: [] },
        prune: { idleHours: 1, maxAgeDays: 1 },
        browser: {
          enabled: false,
          image: "browser",
          containerPrefix: "browser",
          cdpPort: 0,
          vncPort: 0,
          noVncPort: 0,
          headless: true,
          enableNoVnc: false,
          allowHostControl: false,
          autoStart: false,
          autoStartTimeoutMs: 0,
        },
        mode: "all",
        scope: "session",
        workspaceAccess: "rw",
        workspaceRoot: "/ws",
        env: {},
      },
      host: "sandbox",
    });

    const start = Date.now();
    // Requesting 10s (too long)
    try {
      await tool.execute("call1", {
        command: "sleep 10",
        timeout: 10,
      });
      // Should fail
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      expect(String(err)).toMatch(/Command timed out/);
    }

    const duration = Date.now() - start;

    // Should be around 500ms + 1000ms finalization delay = 1500ms
    expect(duration).toBeGreaterThanOrEqual(1450);
    expect(duration).toBeLessThan(2000);
  }, 10000);

  it("respects requested timeout if within budget", async () => {
    const { createExecTool } = await import("./bash-tools.exec.js");
    const tool = createExecTool({
      sandbox: {
        containerName: "test",
        workspaceDir: "/ws",
        containerWorkdir: "/ws",
        executionBudget: { timeoutMs: 2000 }, // 2s budget
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        docker: { image: "test" } as any,
        tools: { allow: [], deny: [] },
        prune: { idleHours: 1, maxAgeDays: 1 },
        browser: {
          enabled: false,
          image: "browser",
          containerPrefix: "browser",
          cdpPort: 0,
          vncPort: 0,
          noVncPort: 0,
          headless: true,
          enableNoVnc: false,
          allowHostControl: false,
          autoStart: false,
          autoStartTimeoutMs: 0,
        },
        mode: "all",
        scope: "session",
        workspaceAccess: "rw",
        workspaceRoot: "/ws",
        env: {},
      },
      host: "sandbox",
    });

    const start = Date.now();
    // Requesting 0.5s (within budget)
    try {
      await tool.execute("call2", {
        command: "sleep 0.5",
        timeout: 0.5,
      });
      // Should fail (mock sleeps forever)
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      expect(String(err)).toMatch(/Command timed out/);
    }

    const duration = Date.now() - start;

    // Should be around 500ms + 1000ms finalization delay = 1500ms
    expect(duration).toBeGreaterThanOrEqual(1450);
    expect(duration).toBeLessThan(2000);
  }, 10000);
});
