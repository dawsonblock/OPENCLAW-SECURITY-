import * as fs from "fs";
import * as path from "path";

export interface RecoveryReport {
  timestamp: number;
  triggeringProvider?: string;
  lastLogs: string[];
  configDiff: string;
  environmentSnapshot: Record<string, string>;
}

/**
 * Handles automatic rollback and safe-mode transitions for system faults.
 */
export class RecoveryManager {
  private isSafeMode: boolean = false;
  private configPath: string;
  private backupConfigPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
    this.backupConfigPath = `${configPath}.bak`;
  }

  public triggerSafeMode(triggeringProvider?: string) {
    if (this.isSafeMode) {
      return;
    }
    this.isSafeMode = true;

    console.error(
      `[RecoveryManager] Triggering SAFE MODE. Provider '${triggeringProvider}' caused crash loop.`,
    );
    this.generateReport(triggeringProvider);
    this.rollbackConfig();
  }

  public generateReport(triggeringProvider?: string): RecoveryReport {
    const report: RecoveryReport = {
      timestamp: Date.now(),
      triggeringProvider,
      lastLogs: this.getLastLogs(),
      configDiff: this.getConfigDiff(),
      environmentSnapshot: this.getSanitizedEnv(),
    };

    const reportPath = path.join(process.cwd(), `recovery-report-${report.timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`[RecoveryManager] Recovery report saved to ${reportPath}`);
    return report;
  }

  private rollbackConfig() {
    if (fs.existsSync(this.backupConfigPath)) {
      console.log(`[RecoveryManager] Rolling back config from ${this.backupConfigPath}`);
      fs.copyFileSync(this.backupConfigPath, this.configPath);
    } else {
      console.warn(
        `[RecoveryManager] No backup config found at ${this.backupConfigPath}. Cannot rollback.`,
      );
    }
  }

  private getLastLogs(): string[] {
    // Dummy implementation for fetching last 500 lines of logs
    return ["Log retrieval not fully implemented yet."];
  }

  private getConfigDiff(): string {
    // Dummy implementation for diffing current vs backup config
    return "Config diff not fully implemented yet.";
  }

  private getSanitizedEnv(): Record<string, string> {
    const safeEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (
        !k.toLowerCase().includes("token") &&
        !k.toLowerCase().includes("secret") &&
        !k.toLowerCase().includes("api_key")
      ) {
        safeEnv[k] = v || "";
      } else {
        safeEnv[k] = "[REDACTED]";
      }
    }
    return safeEnv;
  }
}
