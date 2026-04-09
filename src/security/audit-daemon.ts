import type { OpenClawConfig } from "../config/config.js";
import { calculatePostureHash } from "./posture.js";

export type AuditLogger = (level: "info" | "warn" | "error" | "critical", message: string) => void;

export class AuditDaemon {
  private baselineHash: string | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private configProvider: () => OpenClawConfig,
    private logger: AuditLogger,
  ) {}

  public start(intervalMs: number = 60000) {
    if (this.isRunning) {
      return;
    }

    // Establish baseline
    const currentConfig = this.configProvider();
    this.baselineHash = calculatePostureHash(currentConfig);
    this.logger(
      "info",
      `Audit Daemon started. Baseline posture: ${this.baselineHash.substring(0, 8)}`,
    );

    this.isRunning = true;
    this.intervalId = setInterval(() => this.runAudit(), intervalMs);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.logger("info", "Audit Daemon stopped.");
  }

  public runAudit() {
    if (!this.baselineHash) {
      return;
    }

    try {
      const currentConfig = this.configProvider();
      const currentHash = calculatePostureHash(currentConfig);

      if (currentHash !== this.baselineHash) {
        this.logger(
          "critical",
          `SECURITY VIOLATION: Posture drift detected! Expected ${this.baselineHash.substring(0, 8)}, got ${currentHash.substring(0, 8)}`,
        );
        // In a strict mode, we might emit an event to shutdown, but for now we log CRITICAL.
      } else {
        // Optional: verify liveness
        // this.logger("info", "Posture check passed.");
      }
    } catch (error) {
      this.logger(
        "error",
        `Audit failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  public getBaseline(): string | null {
    return this.baselineHash;
  }
}
