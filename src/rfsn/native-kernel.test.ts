import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../process/exec.js");

import { submitToRfsnKernel } from "./native-kernel.js";
import { runAllowedCommand as runAllowedCommandActual } from "../process/exec.js";

const runAllowedCommandMock = vi.mocked(runAllowedCommandActual);
import type { RfsnActionProposal } from "./types.js";

const FAKE_ABSOLUTE_PATH = "/usr/local/bin/rfsn-gate-bridge";

const sampleProposal: RfsnActionProposal = {
  id: "test-proposal-id",
  timestampMs: 0,
  actor: {} as RfsnActionProposal["actor"],
  toolName: "shell",
  args: { cmd: "echo hi" },
};

describe("submitToRfsnKernel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENCLAW_RFSN_GATE_BRIDGE_PATH = FAKE_ABSOLUTE_PATH;
  });

  afterEach(() => {
    delete process.env.OPENCLAW_RFSN_GATE_BRIDGE_PATH;
  });

  it("rejects when OPENCLAW_RFSN_GATE_BRIDGE_PATH is not set", async () => {
    delete process.env.OPENCLAW_RFSN_GATE_BRIDGE_PATH;
    await expect(submitToRfsnKernel(sampleProposal)).rejects.toThrow(
      /OPENCLAW_RFSN_GATE_BRIDGE_PATH is not set/,
    );
  });

  it("rejects a relative bridge path", async () => {
    process.env.OPENCLAW_RFSN_GATE_BRIDGE_PATH = "./target/release/rfsn-gate-bridge";
    await expect(submitToRfsnKernel(sampleProposal)).rejects.toThrow(
      /bridge path must be absolute/,
    );
  });

  it("delivers stdin payload to runAllowedCommand", async () => {
    vi.mocked(runAllowedCommandActual).mockResolvedValueOnce({
      code: 0,
      signal: null,
      stdout: JSON.stringify({
        result_hash: "abc",
        verdict: "allow",
        reasons: ["ok"],
        execution_budget_us: 100,
      }),
      stderr: "",
    });

    await submitToRfsnKernel(sampleProposal);

    expect(vi.mocked(runAllowedCommandActual)).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(runAllowedCommandActual).mock.calls[0]?.[0] as Record<string, unknown>;
    const stdinText = callArgs?.stdinText as string;
    expect(typeof stdinText).toBe("string");
    const parsed = JSON.parse(stdinText) as { cap: string; payload: unknown };
    expect(parsed.cap).toBe("shell");
    expect(callArgs?.command).toBe(FAKE_ABSOLUTE_PATH);
    expect(callArgs?.allowAbsolutePath).toBe(true);
    expect(callArgs?.allowedBins).toEqual([path.basename(FAKE_ABSOLUTE_PATH)]);
    expect(callArgs?.inheritEnv).toBe(false);
  });

  it("rejects malformed JSON output from the bridge", async () => {
    vi.mocked(runAllowedCommandActual).mockResolvedValueOnce({
      code: 0,
      signal: null,
      stdout: "not-json",
      stderr: "",
    });
    await expect(submitToRfsnKernel(sampleProposal)).rejects.toThrow(
      /Failed to parse Native Gate Decision/,
    );
  });

  it("rejects well-formed JSON that is missing required fields", async () => {
    vi.mocked(runAllowedCommandActual).mockResolvedValueOnce({
      code: 0,
      signal: null,
      stdout: JSON.stringify({ result_hash: "x" }), // missing verdict + reasons
      stderr: "",
    });
    await expect(submitToRfsnKernel(sampleProposal)).rejects.toThrow(
      /malformed response/,
    );
  });

  it("rejects when the bridge exits with a non-zero code", async () => {
    vi.mocked(runAllowedCommandActual).mockResolvedValueOnce({
      code: 1,
      signal: null,
      stdout: "",
      stderr: "bridge crashed",
    });
    await expect(submitToRfsnKernel(sampleProposal)).rejects.toThrow(/Native Gate failed/);
  });

  it("maps 'modify' verdict to 'deny'", async () => {
    vi.mocked(runAllowedCommandActual).mockResolvedValueOnce({
      code: 0,
      signal: null,
      stdout: JSON.stringify({
        result_hash: "xyz",
        verdict: "modify",
        reasons: ["needs change"],
        execution_budget_us: 50,
      }),
      stderr: "",
    });
    const decision = await submitToRfsnKernel(sampleProposal);
    expect(decision.verdict).toBe("deny");
  });
});
