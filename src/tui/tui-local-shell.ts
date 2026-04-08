import type { Component, SelectItem } from "@mariozechner/pi-tui";
import { spawn } from "node:child_process";
import { getShellConfig } from "../agents/shell-utils.js";
import { createSearchableSelectList } from "./components/selectors.js";

/**
 * LOCAL SHELL FEATURE – EXPLICIT OPT-IN REQUIRED
 * -----------------------------------------------
 * This feature runs arbitrary shell commands on the LOCAL machine (the TUI
 * client side, not the gateway). It is intentionally NOT part of the bounded
 * child-process execution story: it runs the user's login shell with
 * full command-string interpretation, inherits the user's env, and is
 * capable of arbitrary file access.
 *
 * It is disabled by default and must be explicitly enabled by setting:
 *   OPENCLAW_LOCAL_SHELL_ENABLED=1
 *   OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED=1
 *
 * Even when enabled, the user is prompted for consent on first use.
 * This is a convenience feature for power users who understand the risk.
 * Do not route this through the bounded subprocess seam or claim it is
 * hardened; the design is deliberately separate.
 */

type LocalShellDeps = {
  chatLog: {
    addSystem: (line: string) => void;
  };
  tui: {
    requestRender: () => void;
  };
  openOverlay: (component: Component) => void;
  closeOverlay: () => void;
  createSelector?: (
    items: SelectItem[],
    maxVisible: number,
  ) => Component & {
    onSelect?: (item: SelectItem) => void;
    onCancel?: () => void;
  };
  spawnCommand?: typeof spawn;
  getCwd?: () => string;
  env?: NodeJS.ProcessEnv;
  maxOutputChars?: number;
};

export function createLocalShellRunner(deps: LocalShellDeps) {
  let localExecAsked = false;
  let localExecAllowed = false;
  const createSelector = deps.createSelector ?? createSearchableSelectList;
  const spawnCommand = deps.spawnCommand ?? spawn;
  const getCwd = deps.getCwd ?? (() => process.cwd());
  const env = deps.env ?? process.env;
  const maxChars = deps.maxOutputChars ?? 40_000;
  const isFeatureEnabled = (env.OPENCLAW_LOCAL_SHELL_ENABLED ?? "").trim() === "1";
  const isUnboundedAckEnabled = (env.OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED ?? "").trim() === "1";
  const isUnboundedLocalShellEnabled = isFeatureEnabled && isUnboundedAckEnabled;

  const ensureLocalExecAllowed = async (): Promise<boolean> => {
    if (localExecAllowed) {
      return true;
    }
    if (localExecAsked) {
      return false;
    }
    localExecAsked = true;

    return await new Promise<boolean>((resolve) => {
      deps.chatLog.addSystem("Allow local shell commands for this session?");
      deps.chatLog.addSystem(
        "This runs commands on YOUR machine (not the gateway) and may delete files or reveal secrets.",
      );
      deps.chatLog.addSystem("Select Yes/No (arrows + Enter), Esc to cancel.");
      const selector = createSelector(
        [
          { value: "no", label: "No" },
          { value: "yes", label: "Yes" },
        ],
        2,
      );
      selector.onSelect = (item) => {
        deps.closeOverlay();
        if (item.value === "yes") {
          localExecAllowed = true;
          deps.chatLog.addSystem("local shell: enabled for this session");
          resolve(true);
        } else {
          deps.chatLog.addSystem("local shell: not enabled");
          resolve(false);
        }
        deps.tui.requestRender();
      };
      selector.onCancel = () => {
        deps.closeOverlay();
        deps.chatLog.addSystem("local shell: cancelled");
        deps.tui.requestRender();
        resolve(false);
      };
      deps.openOverlay(selector);
      deps.tui.requestRender();
    });
  };

  const runLocalShellLine = async (line: string) => {
    const cmd = line.slice(1);
    // NOTE: A lone '!' is handled by the submit handler as a normal message.
    // Keep this guard anyway in case this is called directly.
    if (cmd === "") {
      return;
    }

    // Hard gate: feature is outside the bounded execution model and must be
    // explicitly enabled. When not set, inform the user and do nothing.
    if (!isFeatureEnabled) {
      deps.chatLog.addSystem(
        "[local shell] This feature is outside the bounded security model. " +
          "To enable it for this session, restart with OPENCLAW_LOCAL_SHELL_ENABLED=1 " +
          "and OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED=1.",
      );
      deps.tui.requestRender();
      return;
    }

    if (!isUnboundedAckEnabled) {
      deps.chatLog.addSystem(
        "[local shell] Refusing to enable local shell without " +
          "OPENCLAW_ACK_LOCAL_SHELL_IS_UNBOUNDED=1 because it runs unbounded commands on your machine.",
      );
      deps.tui.requestRender();
      return;
    }

    if (localExecAsked && !localExecAllowed) {
      deps.chatLog.addSystem("local shell: not enabled for this session");
      deps.tui.requestRender();
      return;
    }

    const allowed = await ensureLocalExecAllowed();
    if (!allowed) {
      return;
    }

    deps.chatLog.addSystem(`[local] $ ${cmd}`);
    deps.tui.requestRender();

    await new Promise<void>((resolve) => {
      // Explicitly invoke the configured user shell with its standard command
      // argument (for example `-c` or `-Command`) instead of relying on Node's
      // implicit `shell: true` wrapper. The selected shell still interprets the
      // command string, including shell metacharacters.
      const { shell, args } = getShellConfig();
      const shellArgs = [...args, cmd];
      const child = spawnCommand(shell, shellArgs, {
        cwd: getCwd(),
        env,
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (buf) => {
        stdout += buf.toString("utf8");
      });
      child.stderr.on("data", (buf) => {
        stderr += buf.toString("utf8");
      });

      child.on("close", (code, signal) => {
        const combined = (stdout + (stderr ? (stdout ? "\n" : "") + stderr : ""))
          .slice(0, maxChars)
          .trimEnd();

        if (combined) {
          for (const line of combined.split("\n")) {
            deps.chatLog.addSystem(`[local] ${line}`);
          }
        }
        deps.chatLog.addSystem(
          `[local] exit ${code ?? "?"}${signal ? ` (signal ${String(signal)})` : ""}`,
        );
        deps.tui.requestRender();
        resolve();
      });

      child.on("error", (err) => {
        deps.chatLog.addSystem(`[local] error: ${String(err)}`);
        deps.tui.requestRender();
        resolve();
      });
    });
  };

  return { isUnboundedLocalShellEnabled, runLocalShellLine };
}
