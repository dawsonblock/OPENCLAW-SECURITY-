import { SerialEngine } from "../core/execution/serial_engine.js";
import { DiskQueue, QueuedTask } from "../persist/queue_disk.js";

/**
 * Deterministic Scheduler logic.
 * Pulls highest-priority pending tasks from the strict disk-queue
 * and routes them through the serialized engine.
 */
export class AutomationScheduler {
  private isRunning: boolean = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private queue: DiskQueue,
    private serialEngine: SerialEngine,
    private pollIntervalMs: number = 2000,
  ) {}

  public start() {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    console.log(`[Scheduler] Started. Polling every ${this.pollIntervalMs}ms.`);
    this.loop();
  }

  public stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private async loop() {
    if (!this.isRunning) {
      return;
    }

    try {
      const nextTask = this.queue.getNextPending();
      if (nextTask) {
        await this.executeTask(nextTask);
      }
    } catch (error) {
      console.error("[Scheduler] Error in scheduler loop:", error);
    }

    if (this.isRunning) {
      this.timer = setTimeout(() => this.loop(), this.pollIntervalMs);
    }
  }

  private async executeTask(task: QueuedTask) {
    console.log(`[Scheduler] Executing task ${task.id} (${task.intent} - ${task.priority})`);
    this.queue.updateStatus(task.id, "executing");

    try {
      // Provide action through the strict SerialEngine pipeline
      const ledgerEntry = await this.serialEngine.execute(task.intent, task.payload);
      console.log(
        `[Scheduler] Task ${task.id} finished successfully. Action Hash: ${ledgerEntry.hash}`,
      );
      this.queue.updateStatus(task.id, "completed");
    } catch (error: any) {
      console.error(`[Scheduler] Task ${task.id} failed:`, error.message);
      this.queue.updateStatus(task.id, "failed", error.message);
    }
  }
}
