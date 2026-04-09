import * as fs from "fs";
import * as path from "path";

export interface TaskCheckpoint {
  taskId: string;
  stepIndex: number;
  stateHash: string; // Hash of the deterministic state *after* the checkpointed step
  timestamp: number;
}

/**
 * Persists checkpoints for long-running structured tasks,
 * ensuring they survive agent restarts and crash loops.
 */
export class CheckpointManager {
  private storageFile: string;
  private checkpoints: Map<string, TaskCheckpoint> = new Map();

  constructor(storageDir: string = process.cwd()) {
    this.storageFile = path.join(storageDir, ".checkpoints.json");
    this.load();
  }

  public saveCheckpoint(taskId: string, stepIndex: number, stateHash: string) {
    const cp: TaskCheckpoint = {
      taskId,
      stepIndex,
      stateHash,
      timestamp: Date.now(),
    };
    this.checkpoints.set(taskId, cp);
    this.persist();
    console.log(`[CheckpointManager] Saved checkpoint for ${taskId} at step ${stepIndex}`);
  }

  public loadCheckpoint(taskId: string): TaskCheckpoint | undefined {
    return this.checkpoints.get(taskId);
  }

  public clearCheckpoint(taskId: string) {
    this.checkpoints.delete(taskId);
    this.persist();
    console.log(`[CheckpointManager] Cleared checkpoint for ${taskId}`);
  }

  private load() {
    if (fs.existsSync(this.storageFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.storageFile, "utf8"));
        if (Array.isArray(data)) {
          data.forEach((cp: TaskCheckpoint) => this.checkpoints.set(cp.taskId, cp));
        }
      } catch (err) {
        console.error("[CheckpointManager] Failed to load checkpoints:", err);
      }
    }
  }

  private persist() {
    const data = Array.from(this.checkpoints.values());
    fs.writeFileSync(this.storageFile, JSON.stringify(data, null, 2), "utf8");
  }
}
