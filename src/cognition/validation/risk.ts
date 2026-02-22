export interface TaskFeatures {
  isShellCommand: boolean;
  isFilesystemWrite: boolean;
  isNetworkBound: boolean;
  hasAdminKeywords: boolean;
  touchesSensitiveFiles: boolean;
}

export interface RiskScore {
  score: number; // 0 to 100
  level: "Low" | "Medium" | "High" | "Critical";
  reasons: string[];
}

export interface ToolHistory {
  successRate: number; // 0.0 to 1.0
  failureCount: number;
  lastExecuted: number;
}

/**
 * Probabilistic Risk Predictor.
 * Evaluates intents and payloads to deterministically score the risk of an action.
 */
export class RiskPredictor {
  private toolHistory: Map<string, ToolHistory> = new Map();

  // Configurable thresholds that adapt based on overall system stability
  private adaptiveThresholds = {
    medium: 30,
    high: 60,
    critical: 85,
  };

  public updateToolHistory(tool: string, success: boolean) {
    if (!this.toolHistory.has(tool)) {
      this.toolHistory.set(tool, { successRate: 1.0, failureCount: 0, lastExecuted: Date.now() });
    }

    const history = this.toolHistory.get(tool)!;
    history.lastExecuted = Date.now();

    if (success) {
      // Decay failure impact slowly
      history.successRate = Math.min(1.0, history.successRate + 0.05);
    } else {
      history.failureCount += 1;
      history.successRate = Math.max(0.0, history.successRate - 0.2);
    }
  }

  public extractFeatures(intent: string, payload: any): TaskFeatures {
    const payloadStr = JSON.stringify(payload).toLowerCase();

    return {
      isShellCommand: intent === "execute_shell" || intent === "bash",
      isFilesystemWrite:
        intent.includes("write") || intent.includes("delete") || intent.includes("remove"),
      isNetworkBound:
        intent.includes("fetch") || intent.includes("curl") || intent.includes("request"),
      hasAdminKeywords:
        payloadStr.includes("sudo") ||
        payloadStr.includes("chmod") ||
        payloadStr.includes("rm -rf"),
      touchesSensitiveFiles:
        payloadStr.includes(".ssh") || payloadStr.includes("/etc/") || payloadStr.includes(".env"),
    };
  }

  public calculateRisk(intent: string, payload: any): RiskScore {
    const features = this.extractFeatures(intent, payload);
    const history = this.toolHistory.get(intent) || {
      successRate: 0.5,
      failureCount: 0,
      lastExecuted: 0,
    };

    let score = 0;
    const reasons: string[] = [];

    // Base static feature scoring
    if (features.isShellCommand) {
      score += 40;
      reasons.push("Executes arbitrary shell commands.");
    }
    if (features.isFilesystemWrite) {
      score += 20;
      reasons.push("Modifies filesystem.");
    }
    if (features.touchesSensitiveFiles) {
      score += 50;
      reasons.push("Touches highly sensitive files (.ssh, .env, etc).");
    }
    if (features.hasAdminKeywords) {
      score += 60;
      reasons.push("Contains dangerous admin keywords (e.g., sudo, rm -rf).");
    }
    if (features.isNetworkBound) {
      score += 10;
      reasons.push("Performs outbound network requests.");
    }

    // Adaptive probability modification based on historical reliability
    // If a tool is highly reliable, we reduce its perceived risk slightly (up to -15%)
    // If it fails often, we drastically increase its risk (up to +40%)
    const reliabilityModifier = (1.0 - history.successRate) * 40;
    if (reliabilityModifier > 15) {
      score += reliabilityModifier;
      reasons.push(
        `Tool has low historical reliability (${(history.successRate * 100).toFixed(1)}%).`,
      );
    } else if (history.successRate > 0.9 && score > 0) {
      score = Math.max(0, score - 15);
      reasons.push("Tool is historically very reliable (risk reduced).");
    }

    score = Math.min(100, Math.max(0, Math.floor(score)));

    let level: RiskScore["level"] = "Low";
    if (score >= this.adaptiveThresholds.critical) {
      level = "Critical";
    } else if (score >= this.adaptiveThresholds.high) {
      level = "High";
    } else if (score >= this.adaptiveThresholds.medium) {
      level = "Medium";
    }

    return { score, level, reasons };
  }

  public requiresManualReview(score: RiskScore): boolean {
    return score.level === "Critical" || score.level === "High";
  }
}
