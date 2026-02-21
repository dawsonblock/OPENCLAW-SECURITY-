/**
 * RFSN Native Kernel Bridge
 * -------------------------
 * Connects OpenClaw ActionProposals to the deterministic Rust-compiled
 * H-Gate core via IPC (child process JSON pipe).
 *
 * This module is only invoked when OPENCLAW_RFSN_NATIVE_KERNEL=1.
 * When disabled, the pure-TypeScript evaluateGate path is used instead.
 */

import { spawn } from "node:child_process";
import type { RfsnActionProposal, RfsnGateDecision } from "./types.js";

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
 */
export async function submitToRfsnKernel(proposal: RfsnActionProposal): Promise<RfsnGateDecision> {
  const envelope = {
    cap: proposal.toolName,
    payload: proposal.args,
    timestamp: Date.now(),
  };

  const payloadStr = JSON.stringify(envelope);

  return new Promise((resolve, reject) => {
    const proc = spawn("./target/release/rfsn-gate-bridge", [], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutData = "";
    let stderrData = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdoutData += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderrData += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Native Gate failed with code ${code}: ${stderrData}`));
      }

      try {
        const nativeResponse = JSON.parse(stdoutData) as NativeDecisionResponse;

        // Map native response to the canonical OpenClaw RfsnGateDecision shape
        const openClawDecision: RfsnGateDecision = {
          verdict: nativeResponse.verdict === "modify" ? "deny" : nativeResponse.verdict,
          reasons: nativeResponse.reasons,
          risk: "high",
          normalizedArgs: proposal.args,
          capsGranted: [proposal.toolName],
        };

        resolve(openClawDecision);
      } catch {
        reject(new Error(`Failed to parse Native Gate Decision: ${stdoutData}`));
      }
    });

    proc.stdin.write(payloadStr);
    proc.stdin.end();
  });
}
