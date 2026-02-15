export enum RiskScore {
  LOW = 1,
  MEDIUM = 5,
  HIGH = 10,
  CRITICAL = 100,
}

export type RiskAssessment = {
  score: RiskScore;
  reason: string;
};

export function calculateRisk(toolName: string, args: any): RiskAssessment {
  switch (toolName) {
    case "read_file":
    case "ls":
    case "grep_search":
    case "codebase_search":
      return { score: RiskScore.LOW, reason: "Read-only operation" };

    case "write_to_file":
    case "replace_file_content":
    case "edit_file":
      return { score: RiskScore.MEDIUM, reason: "File modification" };

    case "run_command":
    case "bash":
      // Dynamic check possible here (e.g. if root access requested)
      return { score: RiskScore.HIGH, reason: "Arbitrary command execution" };

    case "network_proxy":
    case "fetch_url":
      return { score: RiskScore.MEDIUM, reason: "Network access" };

    default:
      return { score: RiskScore.LOW, reason: "Unknown tool, defaulting to low" };
  }
}
