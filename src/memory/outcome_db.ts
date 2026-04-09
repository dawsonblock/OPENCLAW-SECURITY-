import * as fs from "fs";
import * as path from "path";

export interface TaskOutcome {
  taskId: string;
  goal: string;
  success: boolean;
  durationMs: number;
  failureReason?: string;
  timestamp: number;
}

export class OutcomeDB {
  private dbPath: string;
  private outcomes: TaskOutcome[] = [];

  constructor(storageDir: string = process.cwd()) {
    this.dbPath = path.join(storageDir, ".memory_outcomes.jsonl");
  }

  public recordOutcome(outcome: TaskOutcome) {
    this.outcomes.push(outcome);
    const line = JSON.stringify(outcome) + "\n";
    fs.appendFileSync(this.dbPath, line, "utf8");
    console.log(
      `[OutcomeDB] Recorded ${outcome.success ? "SUCCESS" : "FAILURE"} outcome for Task ${outcome.taskId}`,
    );
  }

  public loadOutcomes(): TaskOutcome[] {
    if (!fs.existsSync(this.dbPath)) {
      return [];
    }
    const lines = fs
      .readFileSync(this.dbPath, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0);
    return lines.map((line) => JSON.parse(line));
  }
}
