import { describe, it, expect, beforeEach } from "vitest";
import { ModelSuccessTracker } from "./model-success-tracker.js";

describe("ModelSuccessTracker", () => {
  let tracker: ModelSuccessTracker;

  beforeEach(() => {
    tracker = new ModelSuccessTracker({ alpha: 0.15 });
  });

  it("returns null stats for untracked models", () => {
    expect(tracker.getStats("openai", "gpt-4")).toBeNull();
  });

  it("tracks first outcome correctly", () => {
    tracker.recordOutcome("openai", "gpt-4", "success");
    const stats = tracker.getStats("openai", "gpt-4")!;
    expect(stats.samples).toBe(1);
    expect(stats.successRate).toBe(1);
  });

  it("converges EMA towards failure", () => {
    for (let i = 0; i < 15; i++) {
      tracker.recordOutcome("badmodel", "v1", "failure");
    }
    const stats = tracker.getStats("badmodel", "v1")!;
    expect(stats.successRate).toBeLessThan(0.2);
  });

  it("converges EMA towards success", () => {
    // Start with a failure, then succeed many times
    tracker.recordOutcome("goodmodel", "v1", "failure");
    for (let i = 0; i < 15; i++) {
      tracker.recordOutcome("goodmodel", "v1", "success");
    }
    const stats = tracker.getStats("goodmodel", "v1")!;
    expect(stats.successRate).toBeGreaterThan(0.8);
  });

  it("reorders candidates by success rate", () => {
    // Model A fails a lot
    for (let i = 0; i < 10; i++) {
      tracker.recordOutcome("openai", "model-a", "failure");
    }
    // Model B succeeds a lot
    for (let i = 0; i < 10; i++) {
      tracker.recordOutcome("openai", "model-b", "success");
    }

    const candidates = [
      { provider: "openai", model: "model-a" },
      { provider: "openai", model: "model-b" },
    ];

    const reordered = tracker.resolveAdaptiveCandidateOrder(candidates);
    // Model B (higher success rate) should come first
    expect(reordered[0].model).toBe("model-b");
    expect(reordered[1].model).toBe("model-a");
  });

  it("preserves config order for tied success rates", () => {
    // Both models untracked (default 1.0 success rate)
    const candidates = [
      { provider: "openai", model: "first" },
      { provider: "openai", model: "second" },
    ];

    const reordered = tracker.resolveAdaptiveCandidateOrder(candidates);
    expect(reordered[0].model).toBe("first");
    expect(reordered[1].model).toBe("second");
  });

  it("is case-insensitive for provider/model keys", () => {
    tracker.recordOutcome("OpenAI", "GPT-4", "success");
    expect(tracker.getStats("openai", "gpt-4")).not.toBeNull();
    expect(tracker.getStats("OPENAI", "GPT-4")).not.toBeNull();
  });

  it("returns single candidate unchanged", () => {
    const candidates = [{ provider: "openai", model: "solo" }];
    const reordered = tracker.resolveAdaptiveCandidateOrder(candidates);
    expect(reordered).toEqual(candidates);
  });

  it("reset clears all state", () => {
    tracker.recordOutcome("openai", "gpt-4", "success");
    expect(tracker.trackedModelCount).toBe(1);
    tracker.reset();
    expect(tracker.trackedModelCount).toBe(0);
  });
});
