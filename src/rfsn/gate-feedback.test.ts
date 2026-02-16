import { describe, it, expect, beforeEach } from "vitest";
import { GateFeedbackTracker } from "./gate-feedback.js";

describe("GateFeedbackTracker", () => {
  let tracker: GateFeedbackTracker;

  beforeEach(() => {
    tracker = new GateFeedbackTracker({ alpha: 0.1 });
  });

  it("returns null stats for untracked tools", () => {
    expect(tracker.getStats("unknown_tool")).toBeNull();
  });

  it("tracks first outcome correctly", () => {
    tracker.recordOutcome("exec", "success");
    const stats = tracker.getStats("exec")!;
    expect(stats.samples).toBe(1);
    expect(stats.errorRate).toBe(0);
  });

  it("converges EMA towards error rate", () => {
    // Feed 10 errors → error rate should converge towards 1.0
    for (let i = 0; i < 10; i++) {
      tracker.recordOutcome("bad_tool", "error");
    }
    const stats = tracker.getStats("bad_tool")!;
    expect(stats.errorRate).toBeGreaterThan(0.6);
    expect(stats.samples).toBe(10);
  });

  it("converges EMA towards success rate", () => {
    // Feed 10 successes → error rate should converge towards 0.0
    for (let i = 0; i < 10; i++) {
      tracker.recordOutcome("good_tool", "success");
    }
    const stats = tracker.getStats("good_tool")!;
    expect(stats.errorRate).toBeLessThan(0.1);
  });

  it("escalates risk when error rate exceeds threshold", () => {
    // Feed enough errors to cross 40% threshold
    for (let i = 0; i < 10; i++) {
      tracker.recordOutcome("flaky", "error");
    }
    const risk = tracker.resolveAdaptiveRisk("flaky", "low");
    expect(risk).toBe("medium");
  });

  it("escalates medium to high", () => {
    for (let i = 0; i < 10; i++) {
      tracker.recordOutcome("very_flaky", "error");
    }
    const risk = tracker.resolveAdaptiveRisk("very_flaky", "medium");
    expect(risk).toBe("high");
  });

  it("does not escalate beyond high", () => {
    for (let i = 0; i < 10; i++) {
      tracker.recordOutcome("max_risk", "error");
    }
    const risk = tracker.resolveAdaptiveRisk("max_risk", "high");
    expect(risk).toBe("high");
  });

  it("de-escalates risk when error rate is low", () => {
    for (let i = 0; i < 10; i++) {
      tracker.recordOutcome("reliable", "success");
    }
    const risk = tracker.resolveAdaptiveRisk("reliable", "medium");
    expect(risk).toBe("low");
  });

  it("enforces medium floor for intrinsically dangerous tools", () => {
    // Even with perfect success, exec-related tools stay at medium minimum
    for (let i = 0; i < 10; i++) {
      tracker.recordOutcome("exec_safe", "success");
    }
    const risk = tracker.resolveAdaptiveRisk("exec_safe", "medium");
    expect(risk).toBe("medium"); // floor is medium, so medium→low is blocked
  });

  it("does not adjust with insufficient samples", () => {
    // Only 3 samples (below MIN_SAMPLES=5)
    for (let i = 0; i < 3; i++) {
      tracker.recordOutcome("few_sample", "error");
    }
    const risk = tracker.resolveAdaptiveRisk("few_sample", "low");
    expect(risk).toBe("low"); // Not enough data to adjust
  });

  it("isolates stats per tool", () => {
    for (let i = 0; i < 10; i++) {
      tracker.recordOutcome("tool_a", "error");
    }
    for (let i = 0; i < 10; i++) {
      tracker.recordOutcome("tool_b", "success");
    }
    expect(tracker.resolveAdaptiveRisk("tool_a", "low")).toBe("medium");
    expect(tracker.resolveAdaptiveRisk("tool_b", "medium")).toBe("low");
  });

  it("is case-insensitive for tool names", () => {
    tracker.recordOutcome("MyTool", "success");
    expect(tracker.getStats("mytool")).not.toBeNull();
    expect(tracker.getStats("MYTOOL")).not.toBeNull();
  });

  it("reset clears all state", () => {
    tracker.recordOutcome("tool", "success");
    expect(tracker.trackedToolCount).toBe(1);
    tracker.reset();
    expect(tracker.trackedToolCount).toBe(0);
    expect(tracker.getStats("tool")).toBeNull();
  });
});
