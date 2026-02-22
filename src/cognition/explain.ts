import { LedgerEntry } from "../core/ledger/hash_chain.js";
import { RiskPredictor } from "./validation/risk.js";

/**
 * Explainer Engine.
 * Converts strict, dense ledger entries and state hashes into human-readable
 * explanations of *why* an action was taken or blocked.
 */
export class Explainer {
  constructor(private riskPredictor: RiskPredictor) {}

  public explainEvent(entry: LedgerEntry): string {
    const intent = entry.actionType;
    const payload = entry.payload;

    // Base explanation
    let explanation = `Action [${intent}] executed at ${new Date(entry.timestamp).toISOString()}.\n`;

    // Explain logic
    if (payload?.diff?.error) {
      explanation += `Outcome: FAILED (${payload.diff.error}).\n`;
    } else {
      explanation += `Outcome: SUCCESS. State hash transition recorded.\n`;
    }

    // Add Risk/Policy justification
    const riskMetrics = this.riskPredictor.calculateRisk(intent, payload);
    explanation += `Risk Assessment: ${riskMetrics.level} (${riskMetrics.score}/100).\n`;
    if (riskMetrics.reasons.length > 0) {
      explanation += `Primary Factors:\n`;
      for (const item of riskMetrics.reasons) {
        explanation += `  - ${item}\n`;
      }
    }

    return explanation;
  }
}
