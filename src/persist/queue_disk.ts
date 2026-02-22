import * as fs from "fs";
import * as path from "path";

export type TaskPriority = "critical" | "high" | "normal" | "low";
export type TaskStatus = "pending" | "review" | "executing" | "completed" | "failed";

export interface QueuedTask {
  id: string;
  intent: string;
  payload: any;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  requiresReview?: boolean;
  error?: string;
}

/**
 * Disk-backed task queue ensuring jobs survive restarts.
 * Features strict priority ordering and a separate 'review' state for risky tasks.
 */
export class DiskQueue {
  private queueFile: string;
  private tasks: Map<string, QueuedTask> = new Map();

  constructor(storageDir: string = process.cwd()) {
    this.queueFile = path.join(storageDir, "task_queue.json");
    this.load();
  }

  public enqueue(
    intent: string,
    payload: any,
    priority: TaskPriority = "normal",
    requiresReview: boolean = false,
  ): string {
    const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const task: QueuedTask = {
      id,
      intent,
      payload,
      priority,
      status: requiresReview ? "review" : "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      requiresReview,
    };

    this.tasks.set(id, task);
    this.save();
    return id;
  }

  public getNextPending(): QueuedTask | undefined {
    const pending = Array.from(this.tasks.values()).filter((t) => t.status === "pending");
    if (pending.length === 0) {
      return undefined;
    }

    // Sort by priority, then chronological
    const priorityWeight = { critical: 4, high: 3, normal: 2, low: 1 };

    pending.sort((a, b) => {
      if (priorityWeight[a.priority] !== priorityWeight[b.priority]) {
        return priorityWeight[b.priority] - priorityWeight[a.priority];
      }
      return a.createdAt - b.createdAt;
    });

    return pending[0];
  }

  public updateStatus(id: string, status: TaskStatus, error?: string) {
    const task = this.tasks.get(id);
    if (task) {
      task.status = status;
      task.updatedAt = Date.now();
      if (error) {
        task.error = error;
      }
      this.save();
    }
  }

  public getTasksByStatus(status: TaskStatus): QueuedTask[] {
    return Array.from(this.tasks.values()).filter((t) => t.status === status);
  }

  public approveReview(id: string) {
    const task = this.tasks.get(id);
    if (task && task.status === "review") {
      task.status = "pending";
      task.requiresReview = false;
      task.updatedAt = Date.now();
      this.save();
    }
  }

  private save() {
    const data = Array.from(this.tasks.values());
    fs.writeFileSync(this.queueFile, JSON.stringify(data, null, 2), "utf8");
  }

  private load() {
    if (fs.existsSync(this.queueFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.queueFile, "utf8"));
        if (Array.isArray(data)) {
          data.forEach((task: QueuedTask) => this.tasks.set(task.id, task));
        }
      } catch (err) {
        console.error("[DiskQueue] Failed to load disk queue, starting fresh:", err);
      }
    }
  }
}
