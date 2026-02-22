import * as fs from "fs";
import * as path from "path";
import { PolicyConstraint, GateDecision } from "../../policy/engine.js";

/**
 * Implements Project/Workspace Isolation Mode.
 * Forces a "no personal accounts" & constrained filesystem jail boundary.
 */
export class WorkspaceJail implements PolicyConstraint {
  private allowedRootPath: string;

  constructor(workspaceRoot: string) {
    this.allowedRootPath = path.resolve(workspaceRoot);
    // Ensure the directory exists
    if (!fs.existsSync(this.allowedRootPath)) {
      fs.mkdirSync(this.allowedRootPath, { recursive: true });
    }
    console.log(`[WorkspaceJail] Initialized containment boundary at: ${this.allowedRootPath}`);
  }

  public async check(intent: string, payload: any): Promise<GateDecision> {
    // Only inspect intents that involve the filesystem
    if (intent !== "execute_shell" && !intent.includes("write") && !intent.includes("read")) {
      return { allowed: true };
    }

    const payloadStr = JSON.stringify(payload);

    // Shell command extraction (very naive for demonstration)
    // Check if any path string in the payload attempts to exit the workspace recursively
    if (
      payloadStr.includes("..") ||
      payloadStr.includes("~") ||
      (payloadStr.includes("/") && !payloadStr.includes(this.allowedRootPath))
    ) {
      return {
        allowed: false,
        reason: `Path containment violation. Workspace is locked to ${this.allowedRootPath}. Relative climbing or absolute paths outside the root are strictly denied in Project Mode.`,
      };
    }

    return { allowed: true };
  }
}
