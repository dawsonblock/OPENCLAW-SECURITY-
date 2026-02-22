import { Cron } from "croner";
import { DiskQueue } from "../persist/queue_disk.js";

export interface ScheduledTask {
  cronExpression: string;
  intent: string;
  payload: any;
}

/**
 * Executes scheduled repeating automation tasks natively in the background.
 */
export class CronScheduler {
  private jobs: Cron[] = [];

  constructor(private queue: DiskQueue) {}

  public schedule(task: ScheduledTask) {
    console.log(
      `[CronScheduler] Scheduling intent '${task.intent}' on expression '${task.cronExpression}'`,
    );

    const job = new Cron(task.cronExpression, () => {
      console.log(`[CronScheduler] Triggered scheduled intent: ${task.intent}`);
      this.queue.enqueue(task.intent, task.payload, "low", false);
    });

    this.jobs.push(job);
  }

  public stopAll() {
    for (const job of this.jobs) {
      job.stop();
    }
  }
}
