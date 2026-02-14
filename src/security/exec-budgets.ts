/**
 * Execution budget definitions and enforcement helpers.
 *
 * An ExecBudget constrains how much resource a single tool invocation
 * may consume.  The gateway resolves + clamps a budget before routing
 * a command to any execution plane (node-host / sandbox).
 */

// ── Types ──

export type ExecBudget = {
  /** Wall-clock timeout for the entire invocation (ms). */
  timeoutMs: number;
  /** Maximum bytes on stdout before truncation / kill. */
  maxStdoutBytes: number;
  /** Maximum bytes on stderr before truncation / kill. */
  maxStderrBytes: number;
  /** Maximum combined output bytes (stdout + stderr). */
  maxOutputBytes: number;
};

// ── Defaults ──

/** Budget for normal (non-dangerous) commands. */
export const DEFAULT_EXEC_BUDGET: Readonly<ExecBudget> = Object.freeze({
  timeoutMs: 120_000, // 2 minutes
  maxStdoutBytes: 2 * 1024 * 1024, // 2 MB
  maxStderrBytes: 1024 * 1024, // 1 MB
  maxOutputBytes: 3 * 1024 * 1024, // 3 MB combined
});

/** Tighter budget for dangerous / system.run commands. */
export const DEFAULT_DANGEROUS_BUDGET: Readonly<ExecBudget> = Object.freeze({
  timeoutMs: 60_000, // 1 minute
  maxStdoutBytes: 512 * 1024, // 512 KB
  maxStderrBytes: 256 * 1024, // 256 KB
  maxOutputBytes: 768 * 1024, // 768 KB combined
});

/** Absolute maximums — user-supplied values are capped to these. */
const HARD_CAPS: Readonly<ExecBudget> = Object.freeze({
  timeoutMs: 600_000, // 10 minutes
  maxStdoutBytes: 10 * 1024 * 1024, // 10 MB
  maxStderrBytes: 5 * 1024 * 1024, // 5 MB
  maxOutputBytes: 15 * 1024 * 1024, // 15 MB
});

// ── Helpers ──

function clampField(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.min(value, max);
}

/**
 * Merge a partial user-supplied budget with a base budget,
 * clamping every field to HARD_CAPS.
 */
export function clampBudget(
  userBudget?: Partial<ExecBudget>,
  base: Readonly<ExecBudget> = DEFAULT_EXEC_BUDGET,
): ExecBudget {
  return {
    timeoutMs: clampField(userBudget?.timeoutMs, base.timeoutMs, HARD_CAPS.timeoutMs),
    maxStdoutBytes: clampField(
      userBudget?.maxStdoutBytes,
      base.maxStdoutBytes,
      HARD_CAPS.maxStdoutBytes,
    ),
    maxStderrBytes: clampField(
      userBudget?.maxStderrBytes,
      base.maxStderrBytes,
      HARD_CAPS.maxStderrBytes,
    ),
    maxOutputBytes: clampField(
      userBudget?.maxOutputBytes,
      base.maxOutputBytes,
      HARD_CAPS.maxOutputBytes,
    ),
  };
}

/**
 * Resolve the exec budget for a given command.
 * Dangerous commands get a tighter default budget.
 */
export function resolveExecBudget(
  command: string,
  dangerousCommands: readonly string[],
  userBudget?: Partial<ExecBudget>,
): ExecBudget {
  const base = dangerousCommands.includes(command.trim())
    ? DEFAULT_DANGEROUS_BUDGET
    : DEFAULT_EXEC_BUDGET;
  return clampBudget(userBudget, base);
}

/**
 * Hard-cap a timeout value against the budget.
 * Returns the smaller of the two.
 */
export function clampTimeoutMs(userTimeoutMs: number | undefined, budget: ExecBudget): number {
  if (typeof userTimeoutMs !== "number" || !Number.isFinite(userTimeoutMs) || userTimeoutMs <= 0) {
    return budget.timeoutMs;
  }
  return Math.min(userTimeoutMs, budget.timeoutMs);
}
