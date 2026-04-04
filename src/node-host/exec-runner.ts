import path from "node:path";
import type { ExecBudget } from "../security/exec-budgets.js";
import { spawnAllowed } from "../security/subprocess.js";
import type { RunResult } from "./types.js";

export async function runCommand(
  argv: string[],
  cwd: string | undefined,
  env: Record<string, string> | undefined,
  budget: ExecBudget,
): Promise<RunResult> {
  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const command = argv[0] ?? "";
    const child = spawnAllowed({
      command,
      args: argv.slice(1),
      allowedBins: [path.basename(command)],
      allowAbsolutePath: true,
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      inheritEnv: false,
      envOverrides: env as Record<string, string | undefined> | undefined,
      windowsHide: true,
    });

    const onChunk = (chunk: Buffer, target: "stdout" | "stderr") => {
      const currentStdoutLen = stdout.length;
      const currentStderrLen = stderr.length;
      const currentTotalLen = currentStdoutLen + currentStderrLen;

      if (currentTotalLen >= budget.maxTotalOutputBytes) {
        truncated = true;
        return;
      }

      const maxTargetBytes = target === "stdout" ? budget.maxStdoutBytes : budget.maxStderrBytes;
      const currentTargetLen = target === "stdout" ? currentStdoutLen : currentStderrLen;

      if (currentTargetLen >= maxTargetBytes) {
        truncated = true;
        return;
      }

      const remainingTotal = budget.maxTotalOutputBytes - currentTotalLen;
      const remainingTarget = maxTargetBytes - currentTargetLen;
      const limit = Math.min(remainingTotal, remainingTarget);

      const slice = chunk.length > limit ? chunk.subarray(0, limit) : chunk;
      const str = slice.toString("utf8");
      if (target === "stdout") {
        stdout += str;
      } else {
        stderr += str;
      }
      if (chunk.length > limit) {
        truncated = true;
      }
    };

    child.stdout?.on("data", (chunk) => onChunk(chunk as Buffer, "stdout"));
    child.stderr?.on("data", (chunk) => onChunk(chunk as Buffer, "stderr"));

    let timer: NodeJS.Timeout | undefined;
    if (budget.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }, budget.timeoutMs);
    }

    const finalize = (exitCode?: number, error?: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolve({
        exitCode,
        timedOut,
        success: exitCode === 0 && !timedOut && !error,
        stdout,
        stderr,
        error: error ?? null,
        truncated,
      });
    };

    child.on("error", (err) => {
      finalize(undefined, err.message);
    });
    child.on("exit", (code) => {
      finalize(code === null ? undefined : code, null);
    });
  });
}
