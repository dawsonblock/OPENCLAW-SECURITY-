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
  private markerPath: string;
  private reportDir: string;

  constructor(configPath: string) {
    this.configPath = configPath;
    this.backupConfigPath = `${configPath}.bak`;
    this.markerPath = path.join(path.dirname(configPath), ".safe_mode");
    this.reportDir = path.dirname(configPath);
  }

  public triggerSafeMode(triggeringProvider?: string) {
    console.error(
      `[RecoveryManager] Triggering SAFE MODE. Provider '${triggeringProvider}' caused crash loop.`,
    );

    try {
      if (!fs.existsSync(this.markerPath)) {
        fs.writeFileSync(this.markerPath, `triggered-by: ${triggeringProvider || "unknown"}\n`, "utf8");
      }
    } catch (err) {
      console.error(`[RecoveryManager] Failed to write safe-mode marker: ${String(err)}`);
    }

    this.generateReport(triggeringProvider);
    this.rollbackConfig();
  }

  public clearSafeMode() {
    try {
      if (fs.existsSync(this.markerPath)) {
        fs.unlinkSync(this.markerPath);
        console.log("[RecoveryManager] Persistent safe-mode marker cleared.");
      }
    } catch (err) {
      console.error(`[RecoveryManager] Failed to clear safe-mode marker: ${String(err)}`);
    }
  }

  /**
   * Creates a baseline config backup if one does not already exist.
   * This should be called early in the gateway startup on a successful boot.
   */
  public createSnapshotIfMissing() {
    if (!fs.existsSync(this.backupConfigPath) && fs.existsSync(this.configPath)) {
      try {
        fs.copyFileSync(this.configPath, this.backupConfigPath);
        console.log(`[RecoveryManager] Created baseline config backup at ${this.backupConfigPath}`);
      } catch (err) {
        console.warn(`[RecoveryManager] Failed to create config backup: ${String(err)}`);
      }
    }
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
    // Try to find the last few lines of the gateway log
    const logPath = "/tmp/openclaw-gateway.log";
    try {
      if (fs.existsSync(logPath)) {
        const content = fs.readFileSync(logPath, "utf8");
        const lines = content.split("\n").filter(Boolean);
        return lines.slice(-20); // Last 20 lines
      }
    } catch {
      // Ignore
    }
    return ["[Recovery report: gateway log not found or unreadable]"];
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
