/**
 * RFSN Native Kernel Bridge
 * -------------------------
 * Connects OpenClaw ActionProposals to the deterministic Rust-compiled
 * H-Gate core via IPC (child process JSON pipe).
 *
 * This module is only invoked when OPENCLAW_RFSN_NATIVE_KERNEL=1.
 * When disabled, the pure-TypeScript evaluateGate path is used instead.
 *
 * The bridge binary path MUST be set via the OPENCLAW_RFSN_GATE_BRIDGE_PATH
 * environment variable as an absolute path. A relative or missing path causes
 * an immediate rejection – this prevents accidental CWD-relative execution.
 */

import path from "node:path";
import { runAllowedCommand } from "../process/exec.js";
import type { RfsnActionProposal, RfsnGateDecision } from "./types.js";

/** Maximum JSON output the bridge is allowed to produce (64 KiB). */
const MAX_BRIDGE_OUTPUT_BYTES = 64 * 1024;
/** Maximum time allowed for a single gate evaluation (5 s). */
const BRIDGE_TIMEOUT_MS = 5_000;

/**
 * Wire format returned by the native Rust gate bridge process.
 */
export interface NativeDecisionResponse {
  result_hash: string;
  verdict: "allow" | "deny" | "modify";
  reasons: string[];
  execution_budget_us: number;
}

/**
 * Submits an ActionProposal to the native Rust gate binary via stdin/stdout
 * JSON IPC. Returns an RfsnGateDecision compatible with the TypeScript gate.
 *
 * The bridge binary path is read from OPENCLAW_RFSN_GATE_BRIDGE_PATH and
 * must be an absolute path. Execution routes through the shared subprocess
 * seam (runAllowedCommand → spawnAllowed) for env-scrubbing and output caps.
 */
export async function submitToRfsnKernel(proposal: RfsnActionProposal): Promise<RfsnGateDecision> {
  const bridgePath = (process.env.OPENCLAW_RFSN_GATE_BRIDGE_PATH ?? "").trim();

  if (!bridgePath) {
    throw new Error(
      "RFSN native kernel: OPENCLAW_RFSN_GATE_BRIDGE_PATH is not set. " +
        "Provide an absolute path to the rfsn-gate-bridge binary.",
    );
  }
  if (!path.isAbsolute(bridgePath)) {
    throw new Error(
      `RFSN native kernel: bridge path must be absolute, got: ${bridgePath}`,
    );
  }

  const envelope = {
    cap: proposal.toolName,
    payload: proposal.args,
    timestamp: Date.now(),
  };
  const payloadStr = JSON.stringify(envelope);

  const { code, stdout, stderr } = await runAllowedCommand({
    command: bridgePath,
    args: [],
    allowedBins: [path.basename(bridgePath)],
    allowAbsolutePath: true,
    stdinText: payloadStr,
    timeoutMs: BRIDGE_TIMEOUT_MS,
    maxStdoutBytes: MAX_BRIDGE_OUTPUT_BYTES,
    maxStderrBytes: MAX_BRIDGE_OUTPUT_BYTES,
    inheritEnv: false,
  });

  if (code !== 0) {
    throw new Error(`Native Gate failed with code ${code}: ${stderr}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Failed to parse Native Gate Decision: ${stdout}`);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as Record<string, unknown>).verdict !== "string" ||
    !Array.isArray((parsed as Record<string, unknown>).reasons)
  ) {
    throw new Error(`Native Gate returned malformed response: ${stdout}`);
  }

  const nativeResponse = parsed as NativeDecisionResponse;
  const openClawDecision: RfsnGateDecision = {
    verdict: nativeResponse.verdict === "modify" ? "deny" : nativeResponse.verdict,
    reasons: nativeResponse.reasons,
    risk: "high",
    normalizedArgs: proposal.args,
    capsGranted: [proposal.toolName],
  };

  return openClawDecision;
}
