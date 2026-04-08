import { describe, expect, it, vi } from "vitest";
import { createLocalShellRunner } from "./tui-local-shell.js";

const createSelector = () => {
  const selector = {
    onSelect: undefined as ((item: { value: string; label: string }) => void) | undefined,
    onCancel: undefined as (() => void) | undefined,
    render: () => ["selector"],
    invalidate: () => {},
  };
  return selector;
};

describe("createLocalShellRunner", () => {
  it("logs denial on subsequent ! attempts without re-prompting", async () => {
    const messages: string[] = [];
    const chatLog = {
      addSystem: (line: string) => {
        messages.push(line);
      },
    };
    const tui = { requestRender: vi.fn() };
    const openOverlay = vi.fn();
    const closeOverlay = vi.fn();
    let lastSelector: ReturnType<typeof createSelector> | null = null;
    const createSelectorSpy = vi.fn(() => {
      lastSelector = createSelector();
      return lastSelector;
    });
    const spawnCommand = vi.fn();

    const { runLocalShellLine } = createLocalShellRunner({
      chatLog,
      tui,
      openOverlay,
      closeOverlay,
      createSelector: createSelectorSpy,
      env: {
        OPENCLAW_LOCAL_SHELL_ENABLED: "1",
        OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED: "1",
      },
      spawnCommand,
    });

    const firstRun = runLocalShellLine("!ls");
    expect(openOverlay).toHaveBeenCalledTimes(1);
    lastSelector?.onSelect?.({ value: "no", label: "No" });
    await firstRun;

    await runLocalShellLine("!pwd");

    expect(messages).toContain("local shell: not enabled");
    expect(messages).toContain("local shell: not enabled for this session");
    expect(createSelectorSpy).toHaveBeenCalledTimes(1);
    expect(spawnCommand).not.toHaveBeenCalled();
  });

  it("refuses to enable local shell without the explicit unbounded acknowledgement", async () => {
    const messages: string[] = [];
    const { runLocalShellLine, isUnboundedLocalShellEnabled } = createLocalShellRunner({
      chatLog: {
        addSystem: (line: string) => {
          messages.push(line);
        },
      },
      tui: { requestRender: vi.fn() },
      openOverlay: vi.fn(),
      closeOverlay: vi.fn(),
      createSelector: vi.fn(() => createSelector()),
      env: {
        OPENCLAW_LOCAL_SHELL_ENABLED: "1",
      },
      spawnCommand: vi.fn(),
    });

    expect(isUnboundedLocalShellEnabled).toBe(false);
    await runLocalShellLine("!ls");
    expect(messages.some((line) => line.includes("OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED=1"))).toBe(
      true,
    );
  });
});
