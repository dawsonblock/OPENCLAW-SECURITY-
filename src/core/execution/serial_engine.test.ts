import { describe, it, expect, beforeEach } from "vitest";
import { SerialEngine } from "./serial_engine.js";

describe("SerialEngine", () => {
  let engine: SerialEngine;

  beforeEach(() => {
    // Mock executor: just returns the payload as a state diff
    const mockExecutor = async (intent: string, payload: unknown) => {
      return { [intent]: payload };
    };

    engine = new SerialEngine({}, mockExecutor);
  });

  it("should append a valid execution to the ledger and update state", async () => {
    const entry = await engine.execute("set_value", "hello");

    expect(entry.actionType).toBe("set_value");
    expect(engine.getState()).toEqual({ set_value: "hello" });
    expect(engine.getLedger().getEntries().length).toBe(2); // genesis + new entry
  });

  it("should prevent parallel executions", async () => {
    // Mock a slow executor
    const slowExecutor = async (intent: string, payload: unknown) => {
      return new Promise<Record<string, unknown>>((resolve) =>
        setTimeout(() => resolve({ [intent]: payload }), 50),
      );
    };

    const slowEngine = new SerialEngine({}, slowExecutor);

    const p1 = slowEngine.execute("task_1", "data");
    const p2 = slowEngine.execute("task_2", "data");

    await expect(p2).rejects.toThrow(
      "SerialEngine is already executing an action. Parallel execution blocked.",
    );
    await p1; // ensure the first one still completes
  });
});
