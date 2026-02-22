import { ChildProcess, fork } from "child_process";
import { RecoveryManager } from "./recovery.js";

export interface ProviderConfig {
  name: string;
  scriptPath: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Child process supervisor tracking crashes and detecting restart-loops.
 */
export class Supervisor {
  private children: Map<
    string,
    { process?: ChildProcess; config: ProviderConfig; restarts: number[]; lastStarts: number[] }
  > = new Map();
  private readonly MAX_RESTARTS = 5;
  private readonly LOOP_TIME_WINDOW_MS = 60000; // 1 minute

  constructor(private recoveryManager: RecoveryManager) {}

  public registerProvider(config: ProviderConfig) {
    this.children.set(config.name, { config, restarts: [], lastStarts: [] });
  }

  public startAll() {
    for (const [name, config] of this.children.entries()) {
      this.startProvider(name);
    }
  }

  private startProvider(name: string) {
    const state = this.children.get(name);
    if (!state) {
      return;
    }

    const now = Date.now();
    state.lastStarts.push(now);

    // Loop detection
    const recentStarts = state.lastStarts.filter((t) => now - t < this.LOOP_TIME_WINDOW_MS);
    if (recentStarts.length > this.MAX_RESTARTS) {
      console.error(
        `[Supervisor] Crash loop detected for provider ${name} (${recentStarts.length} restarts in window). Triggering safe mode.`,
      );
      this.recoveryManager.triggerSafeMode(name);
      return;
    }

    const child = fork(state.config.scriptPath, { env: state.config.env });
    state.process = child;

    child.on("exit", (code) => {
      console.warn(`[Supervisor] Provider ${name} exited with code ${code}.`);
      state.process = undefined;
      state.restarts.push(Date.now());

      // Wait 1s and attempt restart
      setTimeout(() => this.startProvider(name), 1000);
    });

    child.on("error", (err) => {
      console.error(`[Supervisor] Provider ${name} error:`, err);
    });

    console.log(`[Supervisor] Started provider ${name} (PID: ${child.pid})`);
  }

  public stopAll() {
    for (const [name, state] of this.children.entries()) {
      if (state.process) {
        state.process.kill("SIGTERM");
      }
    }
  }
}
