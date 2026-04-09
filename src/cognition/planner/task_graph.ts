import { SerialEngine } from "../../core/execution/serial_engine.js";
import { CheckpointManager } from "./checkpoint.js";

export interface TaskStep {
  id: string;
  tool: string;
  input: any;
  validate: (output: any) => boolean;
  rollback?: () => Promise<void>;
}

export interface TaskGraphState {
  goal: string;
  steps: TaskStep[];
  currentStepIndex: number;
}

/**
 * Task Graph Planner.
 * A workflow engine that executes structured steps, validates outcomes,
 * and yields checkpoints to allow safe resumption after a hard stop.
 */
export class TaskGraphPlanner {
  constructor(
    private serialEngine: SerialEngine,
    private checkpointManager: CheckpointManager,
  ) {}

  public async executeGraph(taskId: string, graph: TaskGraphState): Promise<boolean> {
    console.log(
      `[TaskGraphPlanner] Starting multi-step workflow for Task ${taskId}: ${graph.goal}`,
    );

    // Try to load a checkpoint to resume an interrupted long-running task
    const checkpoint = this.checkpointManager.loadCheckpoint(taskId);
    if (checkpoint) {
      console.log(
        `[TaskGraphPlanner] Found checkpoint for task ${taskId}. Resuming from step ${checkpoint.stepIndex}.`,
      );
      graph.currentStepIndex = checkpoint.stepIndex;
    }

    while (graph.currentStepIndex < graph.steps.length) {
      const step = graph.steps[graph.currentStepIndex];
      console.log(
        `[TaskGraphPlanner] Executing step ${graph.currentStepIndex + 1}/${graph.steps.length} [Tool: ${step.tool}]`,
      );

      try {
        // Execute deterministically through the serial core
        const ledgerEntry = await this.serialEngine.dispatchIntent(step.tool, step.input);

        // Validate structured requirement
        const output = ledgerEntry.payload?.diff || {};
        const isValid = step.validate(output);

        if (!isValid) {
          console.error(
            `[TaskGraphPlanner] Validation failed for step ${step.id}. Output did not match criteria.`,
          );
          // We trigger rollback or escalate to the FailureReasoner here
          if (step.rollback) {
            console.log(`[TaskGraphPlanner] Triggering rollback sequence for step ${step.id}...`);
            await step.rollback();
          }
          return false;
        }

        // Step succeeded, create a deterministic checkpoint
        graph.currentStepIndex++;
        this.checkpointManager.saveCheckpoint(taskId, graph.currentStepIndex, ledgerEntry.hash);
      } catch (err: any) {
        console.error(`[TaskGraphPlanner] Fatal error executing step ${step.id}:`, err.message);
        return false;
      }
    }

    console.log(`[TaskGraphPlanner] Task ${taskId} completed successfully.`);
    // Clear checkpoint once finished
    this.checkpointManager.clearCheckpoint(taskId);
    return true;
  }
}
