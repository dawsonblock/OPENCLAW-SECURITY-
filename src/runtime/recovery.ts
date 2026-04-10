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
 * Lightweight recovery and safe-mode management.
 *
 * This module provides bounded local fallback behavior:
 * - Safe mode activation when crashes are detected
 * - Config restore from a sibling `.bak` file when present
 * - Sanitized recovery reports for troubleshooting
 *
 * This is not a full backup/restore system. For broader rollback or disaster
 * recovery, operators still need external backup/versioning systems.
 */
export class RecoveryManager {
  private isSafeMode: boolean = false;
  private configPath: string;
  private backupConfigPath: string;
  private reportDir: string;

  constructor(configPath: string) {
    this.configPath = configPath;
    this.backupConfigPath = `${configPath}.bak`;
    this.reportDir = path.dirname(configPath);
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

    const reportPath = path.join(this.reportDir, `recovery-report-${report.timestamp}.json`);
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
    // Note: This is a stub. Full log retrieval would require access to logging infrastructure.
    // In production, logs should be ingested into centralized log aggregation (ELK, Datadog, etc.)
    return ["[Recovery report stub: full log history not available in this version]"];
  }

  private getConfigDiff(): string {
    // Note: This is a stub. Full config diffing would require:
    // 1. Maintaining config history (not implemented)
    // 2. Structured diff computation (use external tools for production)
    // This stub shows what changed is not detailed here.
    if (!fs.existsSync(this.backupConfigPath)) {
      return "[No backup available for diff]";
    }
    return "[Config diff not implemented - use Git or versioning system for production]";
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
