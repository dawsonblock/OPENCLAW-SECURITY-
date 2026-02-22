export type FailureClass =
  | "Auth"
  | "Network"
  | "Permission"
  | "ToolCrash"
  | "Logic"
  | "State"
  | "Unknown";

export interface FailureDiagnosis {
  errorClass: FailureClass;
  details: string;
  confidence: number;
}

/**
 * Categorizes system and tool failures instead of blindly retrying.
 * Used to route failures to the appropriate FixEngine strategy.
 */
export class FailureClassifier {
  public classify(errorMsg: string, context?: any): FailureDiagnosis {
    const lowerReason = errorMsg.toLowerCase();

    if (
      lowerReason.includes("eacces") ||
      lowerReason.includes("permission denied") ||
      lowerReason.includes("forbidden")
    ) {
      return {
        errorClass: "Permission",
        details: "File or scope permission denied.",
        confidence: 0.9,
      };
    }

    if (
      lowerReason.includes("econnrefused") ||
      lowerReason.includes("timeout") ||
      lowerReason.includes("network")
    ) {
      return { errorClass: "Network", details: "Connection failed or timed out.", confidence: 0.9 };
    }

    if (
      lowerReason.includes("unauthorized") ||
      lowerReason.includes("401") ||
      lowerReason.includes("token")
    ) {
      return {
        errorClass: "Auth",
        details: "Authentication token expired or missing.",
        confidence: 0.95,
      };
    }

    if (
      lowerReason.includes("sigterm") ||
      lowerReason.includes("segmentation fault") ||
      lowerReason.includes("memory")
    ) {
      return {
        errorClass: "ToolCrash",
        details: "The underlying tool process crashed.",
        confidence: 0.85,
      };
    }

    if (lowerReason.includes("hash mismatch") || lowerReason.includes("state diverge")) {
      return {
        errorClass: "State",
        details: "Deterministic state verification failed.",
        confidence: 0.95,
      };
    }

    // Generic logic error (e.g. invalid arguments passed to tool)
    if (
      lowerReason.includes("invalid") ||
      lowerReason.includes("bad request") ||
      lowerReason.includes("parse error")
    ) {
      return {
        errorClass: "Logic",
        details: "Input or logical error preventing execution.",
        confidence: 0.8,
      };
    }

    return { errorClass: "Unknown", details: "Unhandled edge case error.", confidence: 0.1 };
  }
}
