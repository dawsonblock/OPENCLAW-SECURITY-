import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AnyAgentTool } from "./pi-tools.types.js";
import { wrapToolWithReplay } from "./pi-tools.replay.js";

// Mocks
const appendLedgerEntryMock = vi.fn();
const readLedgerEntriesMock = vi.fn();

vi.mock("../rfsn/ledger.js", () => ({
  appendLedgerEntry: (...args: any[]) => appendLedgerEntryMock(...args),
  readLedgerEntries: (...args: any[]) => readLedgerEntriesMock(...args),
  resolveLedgerFilePath: () => "/mock/ledger.jsonl",
}));

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("wrapToolWithReplay", () => {
  const mockExecute = vi.fn();
  const mockTool: AnyAgentTool = {
    name: "mock-tool",
    label: "Mock Tool",
    description: "A mock tool",
    parameters: { type: "object", properties: {} },
    execute: mockExecute,
  };

  const context = {
    workspaceDir: "/ws",
    sessionKey: "test-session",
    agentId: "test-agent",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENCLAW_REPLAY_MODE;
  });

  it("RECORD MODE: executes tool and logs to ledger", async () => {
    mockExecute.mockResolvedValue({ output: "success" });

    const wrapped = wrapToolWithReplay(mockTool, context);
    const result = await wrapped.execute("call-1", { foo: "bar" }); // Should invoke execute

    expect(result).toEqual({ output: "success" });
    expect(mockExecute).toHaveBeenCalledTimes(1);

    // Should append proposal and result
    expect(appendLedgerEntryMock).toHaveBeenCalledTimes(2);
    expect(appendLedgerEntryMock.mock.calls[0][0].entry.type).toBe("proposal");
    expect(appendLedgerEntryMock.mock.calls[1][0].entry.type).toBe("result");
  });

  it("REPLAY MODE: skips execution and returns ledger result", async () => {
    process.env.OPENCLAW_REPLAY_MODE = "1";

    const proposalId = "uuid-123";
    readLedgerEntriesMock.mockResolvedValue([
      {
        payload: {
          type: "proposal",
          proposal: {
            id: proposalId,
            toolName: "mock-tool",
            args: { foo: "bar" },
            timestampMs: 1000,
          },
        },
      },
      {
        payload: {
          type: "result",
          proposalId: proposalId,
          result: {
            output: { cached: true },
            status: "ok",
            toolName: "mock-tool",
            durationMs: 10,
          },
        },
      },
    ]);

    const wrapped = wrapToolWithReplay(mockTool, context);
    const result = await wrapped.execute("call-2", { foo: "bar" });

    // Should return cached result
    expect(result).toEqual({ cached: true });

    // Should NOT execute real tool
    expect(mockExecute).not.toHaveBeenCalled();

    // Should NOT append to ledger
    expect(appendLedgerEntryMock).not.toHaveBeenCalled();
  });

  it("REPLAY MODE: executes live if no match found (fallback)", async () => {
    process.env.OPENCLAW_REPLAY_MODE = "1";
    readLedgerEntriesMock.mockResolvedValue([]); // Empty ledger

    mockExecute.mockResolvedValue({ output: "fallback" });

    const wrapped = wrapToolWithReplay(mockTool, context);
    const result = await wrapped.execute("call-3", { foo: "bar" });

    expect(result).toEqual({ output: "fallback" });
    expect(mockExecute).toHaveBeenCalledTimes(1);

    // Should NOT append to ledger (replay mode doesn't record)
    expect(appendLedgerEntryMock).not.toHaveBeenCalled();
  });
});
