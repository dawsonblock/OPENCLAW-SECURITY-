export interface ExecBudget {
  /** Maximum wall-clock time in milliseconds before the process is killed. */
  timeoutMs: number;
  /** Maximum number of bytes allowed for stdout before truncation/kill. */
  maxStdoutBytes: number;
  /** Maximum number of bytes allowed for stderr before truncation/kill. */
  maxStderrBytes: number;
  /** Maximum combined output size (stdout + stderr). */
  maxTotalOutputBytes: number;
  /** Maximum number of concurrent subprocesses allowed (if enforceable). */
  maxSubprocesses: number;
  /** Maximum bytes written to disk by this execution (if enforceable). */
  maxFileWriteBytes: number;
}

/**
 * Default conservative budget for dangerous executions.
 * Prevents resource exhaustion and massive output floods.
 */
export const DEFAULT_DANGEROUS_BUDGET: ExecBudget = {
  timeoutMs: 60_000, // 60 seconds
  maxStdoutBytes: 1_024 * 1024, // 1 MB
  maxStderrBytes: 1_024 * 1024, // 1 MB
  maxTotalOutputBytes: 2 * 1024 * 1024, // 2 MB total
  maxSubprocesses: 3, // Max depth/concurrency
  maxFileWriteBytes: 10 * 1024 * 1024, // 10 MB write limit
};

/**
 * Standard budget for normal executions.
 */
export const DEFAULT_EXEC_BUDGET: ExecBudget = {
  timeoutMs: 300_000, // 5 minutes
  maxStdoutBytes: 10 * 1024 * 1024, // 10 MB
  maxStderrBytes: 10 * 1024 * 1024, // 10 MB
  maxTotalOutputBytes: 20 * 1024 * 1024, // 20 MB total
  maxSubprocesses: 10,
  maxFileWriteBytes: 100 * 1024 * 1024, // 100 MB
};

const SYSTEM_MAX_TIMEOUT_MS = 600_000; // 10 minutes hard cap

/**
 * Clamps a budget against system ceilings.
 */
export function clampBudget(
  requested?: Partial<ExecBudget>,
  base = DEFAULT_EXEC_BUDGET,
): ExecBudget {
  const result = { ...base };
  if (!requested) {
    return result;
  }

  if (
    typeof requested.timeoutMs === "number" &&
    Number.isFinite(requested.timeoutMs) &&
    requested.timeoutMs > 0
  ) {
    result.timeoutMs = Math.min(requested.timeoutMs, SYSTEM_MAX_TIMEOUT_MS);
  }
  if (
    typeof requested.maxStdoutBytes === "number" &&
    Number.isFinite(requested.maxStdoutBytes) &&
    requested.maxStdoutBytes > 0
  ) {
    result.maxStdoutBytes = requested.maxStdoutBytes;
  }
  if (
    typeof requested.maxStderrBytes === "number" &&
    Number.isFinite(requested.maxStderrBytes) &&
    requested.maxStderrBytes > 0
  ) {
    result.maxStderrBytes = requested.maxStderrBytes;
  }
  if (
    typeof requested.maxTotalOutputBytes === "number" &&
    Number.isFinite(requested.maxTotalOutputBytes) &&
    requested.maxTotalOutputBytes > 0
  ) {
    result.maxTotalOutputBytes = requested.maxTotalOutputBytes;
  }
  return result;
}

/**
 * Validates if a user-supplied budget exceeds safe maximums.
 * Returns a safe budget capped at system limits.
 */
export function enforceSafeBudget(requested?: Partial<ExecBudget>): ExecBudget {
  return clampBudget(requested, DEFAULT_DANGEROUS_BUDGET);
}

export function resolveExecBudget(
  command: string,
  dangerousCommands: string[],
  requested?: Partial<ExecBudget>,
): ExecBudget {
  const isDangerous = dangerousCommands.includes(command);
  const base = isDangerous ? DEFAULT_DANGEROUS_BUDGET : DEFAULT_EXEC_BUDGET;
  return clampBudget(requested, base);
}

export function clampTimeoutMs(requested: number | undefined | null, budget: ExecBudget): number {
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested <= 0) {
    return budget.timeoutMs;
  }
  return Math.min(requested, budget.timeoutMs);
}
