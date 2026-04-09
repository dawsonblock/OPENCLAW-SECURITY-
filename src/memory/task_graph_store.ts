import * as fs from "fs";
import * as path from "path";
import { TaskGraphState } from "../cognition/planner/task_graph.js";

/**
 * Persists the structured topology of executed task graphs.
 * Used for future retrieval and pattern matching on similar goals.
 */
export class TaskGraphStore {
  private dbPath: string;
  private graphs: Map<string, TaskGraphState> = new Map();

  constructor(storageDir: string = process.cwd()) {
    this.dbPath = path.join(storageDir, ".memory_graphs.json");
    this.load();
  }

  public storeGraphic(id: string, graph: TaskGraphState) {
    this.graphs.set(id, graph);
    this.persist();
    console.log(`[TaskGraphStore] Saved structural memory for goal: '${graph.goal}'`);
  }

  public retrieveSimilar(queryGoal: string): TaskGraphState | undefined {
    // Extremely naive stub for string similarity logic
    // In reality, this would use semantic embeddings or normalized string distances
    for (const [id, graph] of this.graphs.entries()) {
      if (
        graph.goal.toLowerCase().includes(queryGoal.toLowerCase()) ||
        queryGoal.toLowerCase().includes(graph.goal.toLowerCase())
      ) {
        return graph;
      }
    }
    return undefined;
  }

  private load() {
    if (fs.existsSync(this.dbPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.dbPath, "utf8"));
        Object.keys(data).forEach((k) => this.graphs.set(k, data[k]));
      } catch (e) {
        console.error("[TaskGraphStore] Failed to load memory", e);
      }
    }
  }

  private persist() {
    const obj = Object.fromEntries(this.graphs);
    fs.writeFileSync(this.dbPath, JSON.stringify(obj, null, 2), "utf8");
  }
}
