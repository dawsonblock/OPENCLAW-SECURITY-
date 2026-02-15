import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defaultRuntime } from "../runtime.js";
import { agentCliCommand, type AgentCliOpts } from "./agent-via-gateway.js";

// Mock deps
const mockAgentCommand = vi.fn();
vi.mock("./agent.js", () => ({
  agentCommand: (...args: any[]) => mockAgentCommand(...args),
}));

describe("agentCliCommand with --replay", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENCLAW_REPLAY_MODE;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("sets OPENCLAW_REPLAY_MODE and calls agentCommand (local) when replay is true", async () => {
    const opts: AgentCliOpts = {
      message: "foo",
      replay: true,
      // local is undefined/false by default
    };

    await agentCliCommand(opts, defaultRuntime, undefined);

    expect(process.env.OPENCLAW_REPLAY_MODE).toBe("1");
    expect(mockAgentCommand).toHaveBeenCalledTimes(1);
    // Verify arguments passed to agentCommand
    const calledOpts = mockAgentCommand.mock.calls[0][0];
    expect(calledOpts.replay).toBe(true);
    // It should treat it as local execution (no gateway call)
    // The implementation passes opts directly, but force-returns the result of agentCommand
  });

  it("does NOT set OPENCLAW_REPLAY_MODE when replay is false", async () => {
    const opts: AgentCliOpts = {
      message: "foo",
      replay: false,
      local: true, // force local to avoid gateway call in test
    };

    await agentCliCommand(opts, defaultRuntime, undefined);

    expect(process.env.OPENCLAW_REPLAY_MODE).toBeUndefined();
    expect(mockAgentCommand).toHaveBeenCalledTimes(1);
  });
});
