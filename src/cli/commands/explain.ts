import { Command } from "commander";
import { Explainer } from "../../cognition/explain.js";
import { RiskPredictor } from "../../cognition/validation/risk.js";

export const explainCommand = new Command("explain")
  .description("Provides a human-readable explanation of an action trace from the ledger.")
  .argument("<run_id>", "The run ID to explain")
  .action((run_id) => {
    console.log(`🔎 Explain Trace for run: ${run_id}\n`);

    // Mocking ledger retrieval for now
    const mockEntry = {
      index: 1,
      timestamp: Date.now(),
      actionType: "execute_shell",
      payload: {
        command: "npm install",
        diff: { error: "EACCES: permission denied, mkdir '/workspace/node_modules'" },
      },
      previousHash: "genesis",
      hash: "abc123mock",
    };

    const predictor = new RiskPredictor();
    const explainer = new Explainer(predictor);

    console.log(explainer.explainEvent(mockEntry));

    console.log("\nIf this failed, you can run `openclaw repair` to attempt auto-remediation.");
  });
