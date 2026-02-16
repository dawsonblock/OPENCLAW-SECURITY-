import { describe, expect, test } from "vitest";
import {
  clampBudget,
  clampTimeoutMs,
  DEFAULT_DANGEROUS_BUDGET,
  DEFAULT_EXEC_BUDGET,
  resolveExecBudget,
} from "./exec-budgets.js";

describe("exec-budgets", () => {
  describe("clampBudget", () => {
    test("returns defaults when no user budget provided", () => {
      const budget = clampBudget();
      expect(budget).toEqual({ ...DEFAULT_EXEC_BUDGET });
    });

    test("returns dangerous defaults when using dangerous base", () => {
      const budget = clampBudget(undefined, DEFAULT_DANGEROUS_BUDGET);
      expect(budget).toEqual({ ...DEFAULT_DANGEROUS_BUDGET });
    });

    test("clamps user timeout to hard cap", () => {
      const budget = clampBudget({ timeoutMs: 999_999_999 });
      expect(budget.timeoutMs).toBe(600_000); // 10 min cap
    });

    test("ignores non-finite values", () => {
      const budget = clampBudget({ timeoutMs: NaN, maxStdoutBytes: -1 });
      expect(budget.timeoutMs).toBe(DEFAULT_EXEC_BUDGET.timeoutMs);
      expect(budget.maxStdoutBytes).toBe(DEFAULT_EXEC_BUDGET.maxStdoutBytes);
    });

    test("respects valid user values below caps", () => {
      const budget = clampBudget({ timeoutMs: 30_000, maxStdoutBytes: 1024 });
      expect(budget.timeoutMs).toBe(30_000);
      expect(budget.maxStdoutBytes).toBe(1024);
      // untouched fields use defaults
      expect(budget.maxStderrBytes).toBe(DEFAULT_EXEC_BUDGET.maxStderrBytes);
    });
  });

  describe("resolveExecBudget", () => {
    const dangerousCommands = ["system.run"];

    test("picks dangerous budget for dangerous commands", () => {
      const budget = resolveExecBudget("system.run", dangerousCommands);
      expect(budget.timeoutMs).toBe(DEFAULT_DANGEROUS_BUDGET.timeoutMs);
    });

    test("picks normal budget for non-dangerous commands", () => {
      const budget = resolveExecBudget("system.describe", dangerousCommands);
      expect(budget.timeoutMs).toBe(DEFAULT_EXEC_BUDGET.timeoutMs);
    });

    test("merges user overrides with dangerous base", () => {
      const budget = resolveExecBudget("system.run", dangerousCommands, {
        timeoutMs: 45_000,
      });
      expect(budget.timeoutMs).toBe(45_000);
      expect(budget.maxStdoutBytes).toBe(DEFAULT_DANGEROUS_BUDGET.maxStdoutBytes);
    });
  });

  describe("clampTimeoutMs", () => {
    const budget = { ...DEFAULT_EXEC_BUDGET, timeoutMs: 60_000 };

    test("returns budget timeout when user timeout is undefined", () => {
      expect(clampTimeoutMs(undefined, budget)).toBe(60_000);
    });

    test("returns budget timeout when user timeout exceeds it", () => {
      expect(clampTimeoutMs(120_000, budget)).toBe(60_000);
    });

    test("returns user timeout when below budget", () => {
      expect(clampTimeoutMs(30_000, budget)).toBe(30_000);
    });

    test("returns budget timeout for invalid values", () => {
      expect(clampTimeoutMs(NaN, budget)).toBe(60_000);
      expect(clampTimeoutMs(-1, budget)).toBe(60_000);
    });
  });
});
