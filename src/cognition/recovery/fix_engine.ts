import { RecoveryManager } from "../../runtime/recovery.js";
import { FailureClassifier, FailureClass, FailureDiagnosis } from "./failure_classifier.js";

export interface FixPlan {
  action: "Retry" | "Rollback" | "Reconfigure" | "SafeMode" | "Escalate";
  description: string;
  targetComponent?: string;
}

/**
 * Diagnostics and auto-repair engine. Maps classified errors to executable fix plans.
 */
export class FixEngine {
  constructor(
    private classifier: FailureClassifier,
    private recoveryManager: RecoveryManager,
  ) {}

  public generateFixPlan(errorMsg: string, toolName: string, context?: any): FixPlan {
    console.log(`[FixEngine] Analyzing failure from tool: ${toolName}`);
    const diagnosis = this.classifier.classify(errorMsg, context);
    console.log(
      `[FixEngine] Diagnosis: [${diagnosis.errorClass}] ${diagnosis.details} (Confidence: ${diagnosis.confidence})`,
    );

    switch (diagnosis.errorClass) {
      case "Auth":
        return {
          action: "Reconfigure",
          description: "Prompt user for new tokens or load from secondary secure fallback.",
          targetComponent: "CredentialStore",
        };

      case "Network":
        // Transient faults can be retried 1-2 times with backoff
        return {
          action: "Retry",
          description: "Network timeout detected. Executing exponential backoff retry.",
          targetComponent: toolName,
        };

      case "ToolCrash":
        return {
          action: "SafeMode",
          description:
            "Component crash detected. Handing off to RecoveryManager for safe-mode isolation.",
          targetComponent: toolName,
        };

      case "Permission":
      case "Logic":
        // Logic/Permission errors usually don't resolve from retries without changing the inputs
        return {
          action: "Escalate",
          description:
            "Logical or permission fault. Cannot safely auto-retry without modifying task structure.",
          targetComponent: "TaskGraphPlanner",
        };

      case "State":
        return {
          action: "Rollback",
          description: "State divergence detected. Restoring snapshot from before step execution.",
          targetComponent: "SnapshotManager",
        };

      default:
        return {
          action: "Escalate",
          description: "Unknown failure type requiring human intervention.",
        };
    }
  }

  public async applyFix(plan: FixPlan): Promise<boolean> {
    console.log(`[FixEngine] Applying fix plan: ${plan.action} -> ${plan.description}`);

    if (plan.action === "SafeMode") {
      this.recoveryManager.triggerSafeMode(plan.targetComponent);
      return true;
    }

    if (plan.action === "Escalate") {
      console.error(
        `[FixEngine] Fix required escalation. Run 'openclaw doctor' for human diagnosis.`,
      );
      return false;
    }

    // Rollback, Retry, Reconfigure are handled higher up in the execution orchestrator
    return true;
  }
}
