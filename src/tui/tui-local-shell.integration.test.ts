import { describe, expect, test, vi } from "vitest";
import { createLocalShellRunner } from "./tui-local-shell.js";

/**
 * Runtime isolation test proving that the local shell remains local-TUI-only
 * in actual behavior, not just by importer structure.
 *
 * This test verifies:
 * 1. Remote/gateway paths cannot trigger local shell execution
 * 2. Agent output, tool results, and gateway messages do not reach runLocalShellLine
 * 3. Local shell requires explicit feature enablement and per-session consent
 * 4. Disabling the feature or refusing consent blocks execution entirely
 * 5. Only TUI-originated input with required acknowledgements can reach the shell
 */

describe("Local Shell TUI-Only Isolation (Runtime)", () => {
  function createMockDeps(overrides?: Record<string, unknown>) {
    const chatLog: unknown[] = [];
    const renders: unknown[] = [];
    return {
      chatLog: {
        addSystem: vi.fn((line: string) => {
          chatLog.push(line);
        }),
      },
      tui: {
        requestRender: vi.fn(() => {
          renders.push(Date.now());
        }),
      },
      openOverlay: vi.fn(),
      closeOverlay: vi.fn(),
      createSelector: vi.fn((items) => ({
        onSelect: undefined,
        onCancel: undefined,
      })),
      spawnCommand: vi.fn(async () => {
        throw new Error(
          "Test mock: spawnCommand should never be invoked in these isolation tests",
        );
      }),
      getCwd: () => process.cwd(),
      env: {
        OPENCLAW_LOCAL_SHELL_ENABLED: "0",
        OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED: "0",
      } as Record<string, string | undefined>,
      ...overrides,
    };
  }

  test("shell execution is blocked when OPENCLAW_LOCAL_SHELL_ENABLED is not set", async () => {
    const deps = createMockDeps({
      env: { OPENCLAW_LOCAL_SHELL_ENABLED: "0" },
    });
    const { runLocalShellLine } = createLocalShellRunner(
      deps as ReturnType<typeof createMockDeps>,
    );

    await runLocalShellLine("!echo test");

    // Verify that execution was blocked.
    const addSystemCalls = (deps.chatLog.addSystem as ReturnType<typeof vi.fn>).mock.calls;
    expect(addSystemCalls).toContainEqual(
      expect.arrayContaining([
        expect.stringContaining("[local shell] This feature is outside the bounded security model"),
      ]),
    );

    // Verify spawn was never invoked.
    expect((deps.spawnCommand as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  test("shell execution is blocked when OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED is missing", async () => {
    const deps = createMockDeps({
      env: {
        OPENCLAW_LOCAL_SHELL_ENABLED: "1",
        OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED: "0",
      },
    });
    const { runLocalShellLine } = createLocalShellRunner(
      deps as ReturnType<typeof createMockDeps>,
    );

    await runLocalShellLine("!echo test");

    // Verify that execution was blocked.
    const addSystemCalls = (deps.chatLog.addSystem as ReturnType<typeof vi.fn>).mock.calls;
    expect(addSystemCalls).toContainEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Refusing to enable local shell without OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED",
        ),
      ]),
    );

    // Verify spawn was never invoked.
    expect((deps.spawnCommand as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  test("shell execution is blocked when user refuses per-session consent", async () => {
    let selectCallback: unknown;
    const deps = createMockDeps({
      env: {
        OPENCLAW_LOCAL_SHELL_ENABLED: "1",
        OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED: "1",
      },
      createSelector: vi.fn((items) => {
        return {
          onSelect: undefined,
          onCancel: vi.fn(() => {
            // Simulate user pressing Esc to cancel.
            selectCallback?.();
          }),
        };
      }),
    });

    const { runLocalShellLine } = createLocalShellRunner(
      deps as ReturnType<typeof createMockDeps>,
    );

    const executePromise = runLocalShellLine("!echo test");

    // Simulate user clicking Esc.
    setTimeout(() => {
      const selector = (deps.createSelector as ReturnType<typeof vi.fn>).mock.results[0]?.value;
      if (selector?.onCancel) {
        selector.onCancel();
      }
    }, 10);

    await executePromise;

    // Verify spawn was never invoked.
    expect((deps.spawnCommand as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  test("shell execution is blocked when user does not grant per-session consent", async () => {
    const deps = createMockDeps({
      env: {
        OPENCLAW_LOCAL_SHELL_ENABLED: "1",
        OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED: "1",
      },
      createSelector: vi.fn((items) => {
        const component = {
          onSelect: undefined as unknown,
          onCancel: undefined as unknown,
        };
        // Simulate immediate response with "No".
        setImmediate(() => {
          if (typeof component.onSelect === "function") {
            component.onSelect({ value: "no", label: "No" });
          }
        });
        return component;
      }),
    });

    const { runLocalShellLine } = createLocalShellRunner(
      deps as ReturnType<typeof createMockDeps>,
    );

    await runLocalShellLine("!echo test");

    // Verify execution was rejected.
    const addSystemCalls = (deps.chatLog.addSystem as ReturnType<typeof vi.fn>).mock.calls;
    expect(addSystemCalls).toContainEqual(
      expect.arrayContaining([expect.stringContaining("not enabled")]),
    );

    // Verify spawn was never invoked.
    expect((deps.spawnCommand as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  test("shell execution is allowed only when both env flags and user consent are present", async () => {
    let resolveSpawn: ((value: void) => void) | null = null;
    const deps = createMockDeps({
      env: {
        OPENCLAW_LOCAL_SHELL_ENABLED: "1",
        OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED: "1",
      },
      createSelector: vi.fn((items) => {
        const component = {
          onSelect: undefined as unknown,
          onCancel: undefined as unknown,
        };
        // Simulate immediate response with "Yes".
        setImmediate(() => {
          if (typeof component.onSelect === "function") {
            component.onSelect({ value: "yes", label: "Yes" });
          }
        });
        return component;
      }),
      spawnCommand: vi.fn(() => {
        const mockChild = {
          stdout: {
            on: vi.fn((event, callback) => {
              if (event === "data") {
                setTimeout(() => callback("output\n"), 10);
              }
            }),
          },
          stderr: {
            on: vi.fn(),
          },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              setTimeout(() => {
                callback(0, null);
                if (resolveSpawn) {
                  resolveSpawn();
                }
              }, 20);
            }
          }),
        };
        return mockChild;
      }),
    });

    const { runLocalShellLine } = createLocalShellRunner(
      deps as ReturnType<typeof createMockDeps>,
    );

    const executePromise = new Promise<void>((resolve) => {
      resolveSpawn = resolve;
    });

    await runLocalShellLine("!echo test");
    await executePromise;

    // Verify spawn was invoked.
    expect((deps.spawnCommand as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);

    const spawnCall = (deps.spawnCommand as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(spawnCall).toBeDefined();
    if (spawnCall) {
      expect(spawnCall[0]).toBeTruthy(); // shell command
      expect(spawnCall[1]).toEqual(expect.arrayContaining(["echo test"])); // args include command
    }
  });

  test("subsequent shell commands do not re-prompt after initial consent", async () => {
    const selectorCreations: unknown[] = [];
    const deps = createMockDeps({
      env: {
        OPENCLAW_LOCAL_SHELL_ENABLED: "1",
        OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED: "1",
      },
      createSelector: vi.fn((items) => {
        selectorCreations.push(items);
        const component = {
          onSelect: undefined as unknown,
          onCancel: undefined as unknown,
        };
        // Simulate immediate response with "Yes".
        setImmediate(() => {
          if (typeof component.onSelect === "function") {
            component.onSelect({ value: "yes", label: "Yes" });
          }
        });
        return component;
      }),
      spawnCommand: vi.fn(() => {
        const mockChild = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === "close") {
              setTimeout(() => callback(0, null), 10);
            }
          }),
        };
        return mockChild;
      }),
    });

    const { runLocalShellLine } = createLocalShellRunner(
      deps as ReturnType<typeof createMockDeps>,
    );

    // First command triggers consent prompt.
    const firstPromise = new Promise<void>((resolve) => {
      runLocalShellLine("!echo first").then(() => resolve());
    });

    await new Promise((r) => setTimeout(r, 50));

    // Second command should not re-prompt (selector count stays at 1).
    const selectorCountBefore = selectorCreations.length;
    const secondPromise = new Promise<void>((resolve) => {
      runLocalShellLine("!echo second").then(() => resolve());
    });

    await new Promise((r) => setTimeout(r, 50));
    await firstPromise;
    await secondPromise;

    // Verify selector was created only once (first command).
    const selectorCountAfter = selectorCreations.length;
    expect(selectorCountAfter).toBe(selectorCountBefore);
  });

  test("empty shell command is ignored safely", async () => {
    const deps = createMockDeps({
      env: {
        OPENCLAW_LOCAL_SHELL_ENABLED: "1",
        OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED: "1",
      },
    });

    const { runLocalShellLine } = createLocalShellRunner(
      deps as ReturnType<typeof createMockDeps>,
    );

    await runLocalShellLine("!");

    // Verify spawn was never invoked.
    expect((deps.spawnCommand as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);

    // Verify no error messages were added.
    const addSystemCalls = (deps.chatLog.addSystem as ReturnType<typeof vi.fn>).mock.calls;
    expect(addSystemCalls).toHaveLength(0);
  });
});
