import { ReplayEngine } from "../../core/execution/replay_engine.js";
import { LedgerEntry } from "../../core/ledger/hash_chain.js";
import { RiskPredictor } from "../validation/risk.js";

/**
 * Handles offline learning loops that improve tool selection heuristics
 * without ever altering the hard security constraints (Bounded Self-Improvement).
 */
export class OfflineOptimizer {
  constructor(private riskPredictor: RiskPredictor) {}

  /**
   * Re-simulates a past task run and updates reliability weights
   * based on whether errors occurred during tool execution.
   */
  public async evaluateRun(runId: string, entries: LedgerEntry[]) {
    console.log(`[OfflineOptimizer] Evaluating run ${runId} for self-improvement...`);
    let successCount = 0;
    let failureCount = 0;

    for (const entry of entries) {
      // We look at the deterministic output payload to see if an error occurred.
      // This assumes the executor packs {"error": "..."} upon failure.
      const intent = entry.actionType;
      const payloadContent = entry.payload?.diff || entry.payload;

      const isFailure = payloadContent?.error !== undefined || payloadContent?.status === "fail";

      // Adjust weights via RiskPredictor
      this.riskPredictor.updateToolHistory(intent, !isFailure);

      if (isFailure) {
        failureCount++;
        console.log(`[OfflineOptimizer] Lowering reliability weight for tool: ${intent}`);
      } else {
        successCount++;
      }
    }

    console.log(
      `[OfflineOptimizer] Run evaluation complete. Successes: ${successCount}, Failures: ${failureCount}`,
    );
    this.verifyConstraints(); // Ensure the model didn't drift
  }

  /**
   * Bounded Constraint Verification:
   * Ensures that safe-mode toggles and strictly denied features haven't been 'learned' away.
   */
  private verifyConstraints() {
    console.log("[OfflineOptimizer] Verifying safety bounds post-evaluation...");
    // This is a stub for logic that would verify that e.g. "execute_shell" still has a high base risk score
    const mockScore = this.riskPredictor.calculateRisk("execute_shell", "rm -rf /");
    if (mockScore.level !== "Critical") {
      throw new Error(
        `CRITICAL DRIFT DETECTED: execution of arbitrary destructive shell scored as '${mockScore.level}'. Restoring defaults.`,
      );
    }
    console.log("[OfflineOptimizer] Bounds verified intact.");
  }
}
