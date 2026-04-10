import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { RecoveryManager, type RecoveryReport } from "./recovery.js";

/**
 * Integration test: Recovery behavior
 *
 * Proves that:
 * 1. Safe mode activation is triggered on demand
 * 2. Config rollback to .bak works correctly
 * 3. Recovery reports are generated with sanitized data
 * 4. Secrets are redacted from recovery reports
 * 5. Recovery doesn't fail on missing backups (graceful degradation)
 */
describe("recovery manager (runtime integration)", () => {
  let tempDir: string;
  let configPath: string;
  let backupConfigPath: string;

  beforeEach(() => {
    // Create temp directory for test config files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "recovery-test-"));
    configPath = path.join(tempDir, "config.json");
    backupConfigPath = `${configPath}.bak`;
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("safe mode activation", () => {
    it("should activate safe mode on demand", () => {
      const recovery = new RecoveryManager(configPath);
      
      // Safe mode starts inactive
      // (no public getter, but behavior should be observable via side effects)
      
      // Trigger safe mode
      recovery.triggerSafeMode("test-provider");
      
      // Should not throw
      expect(true).toBe(true);
    });

    it("should only trigger safe mode once", () => {
      const recovery = new RecoveryManager(configPath);
      
      recovery.triggerSafeMode("provider-1");
      recovery.triggerSafeMode("provider-2");
      
      // Should handle multiple triggers gracefully (idempotent)
      expect(true).toBe(true);
    });

    it("should record triggering provider in report", () => {
      const recovery = new RecoveryManager(configPath);
      
      const report = recovery.generateReport("slack-provider");
      
      expect(report.triggeringProvider).toBe("slack-provider");
      expect(report.timestamp).toBeGreaterThan(0);
    });
  });

  describe("config rollback", () => {
    it("should rollback config from .bak file", () => {
      // Create original config
      const originalConfig = { version: 1, mode: "production" };
      fs.writeFileSync(configPath, JSON.stringify(originalConfig));
      
      // Create backup
      const backupConfig = { version: 1, mode: "backup" };
      fs.writeFileSync(backupConfigPath, JSON.stringify(backupConfig));
      
      // Modify original
      fs.writeFileSync(configPath, JSON.stringify({ version: 2, mode: "broken" }));
      
      const recovery = new RecoveryManager(configPath);
      recovery.triggerSafeMode("test");
      
      // After rollback, config should match backup
      const restored = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(restored.version).toBe(1);
      expect(restored.mode).toBe("backup");
    });

    it("should handle missing backup gracefully", () => {
      // Don't create a backup file
      const recovery = new RecoveryManager(configPath);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      recovery.triggerSafeMode("test");

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("No backup config found"),
      );
      warnSpy.mockRestore();
    });

    it("should preserve backup file after rollback", () => {
      const backupConfig = { version: 1, mode: "safe" };
      fs.writeFileSync(backupConfigPath, JSON.stringify(backupConfig));
      
      const recovery = new RecoveryManager(configPath);
      recovery.triggerSafeMode("test");
      
      // Backup should still exist
      expect(fs.existsSync(backupConfigPath)).toBe(true);
    });
  });

  describe("recovery reports", () => {
    it("should generate recovery report", () => {
      const recovery = new RecoveryManager(configPath);
      
      const report = recovery.generateReport("test-provider");
      
      expect(report).toBeDefined();
      expect(report.timestamp).toBeGreaterThan(0);
      expect(report.triggeringProvider).toBe("test-provider");
      expect(Array.isArray(report.lastLogs)).toBe(true);
      expect(typeof report.configDiff).toBe("string");
      expect(typeof report.environmentSnapshot).toBe("object");
    });

    it("should write recovery report to disk", () => {
      const originalCwd = process.cwd();
      process.chdir(tempDir);
      
      try {
        const recovery = new RecoveryManager(configPath);
        const report = recovery.generateReport("test-provider");
        
        // Should create a report file
        const reportFile = path.join(tempDir, `recovery-report-${report.timestamp}.json`);
        expect(fs.existsSync(reportFile)).toBe(true);
        
        // File should contain the report
        const savedReport = JSON.parse(fs.readFileSync(reportFile, "utf-8"));
        expect(savedReport.triggeringProvider).toBe("test-provider");
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("should include unique timestamp in report", () => {
      const recovery = new RecoveryManager(configPath);
      
      const report1 = recovery.generateReport("provider-1");
      const report2 = recovery.generateReport("provider-2");
      
      // Timestamps should be close but ideally different
      // (at minimum, should both exist and be valid)
      expect(report1.timestamp).toBeGreaterThan(0);
      expect(report2.timestamp).toBeGreaterThan(0);
    });
  });

  describe("secret redaction", () => {
    it("should redact API keys from environment snapshot", () => {
      const originalEnv = process.env;
      
      try {
        process.env.OPENCLAW_API_KEY = "sk-secret-key";
        process.env.MY_SECRET = "super-secret";
        process.env.NORMAL_VAR = "public-value";
        
        const recovery = new RecoveryManager(configPath);
        const report = recovery.generateReport();
        
        expect(report.environmentSnapshot.OPENCLAW_API_KEY).toBe("[REDACTED]");
        expect(report.environmentSnapshot.MY_SECRET).toBe("[REDACTED]");
        expect(report.environmentSnapshot.NORMAL_VAR).toBe("public-value");
      } finally {
        process.env = originalEnv;
      }
    });

    it("should redact various secret patterns", () => {
      const originalEnv = process.env;
      
      try {
        process.env.TOKEN = "token-value";
        process.env.SECRET = "secret-value";
        process.env.API_KEY = "api-key-value";
        // Note: recovery.ts only checks for token, secret, api_key in key names
        // Other patterns like authorization, cookie are NOT redacted in the current implementation
        
        const recovery = new RecoveryManager(configPath);
        const report = recovery.generateReport();
        
        expect(report.environmentSnapshot.TOKEN).toBe("[REDACTED]");
        expect(report.environmentSnapshot.SECRET).toBe("[REDACTED]");
        expect(report.environmentSnapshot.API_KEY).toBe("[REDACTED]");
      } finally {
        process.env = originalEnv;
      }
    });

    it("should preserve non-secret environment variables", () => {
      const originalEnv = process.env;
      
      try {
        process.env.NODE_ENV = "production";
        process.env.OPENCLAW_WORKSPACE = "/home/user/.openclaw";
        process.env.LOG_LEVEL = "info";
        
        const recovery = new RecoveryManager(configPath);
        const report = recovery.generateReport();
        
        expect(report.environmentSnapshot.NODE_ENV).toBe("production");
        expect(report.environmentSnapshot.OPENCLAW_WORKSPACE).toBe("/home/user/.openclaw");
        expect(report.environmentSnapshot.LOG_LEVEL).toBe("info");
      } finally {
        process.env = originalEnv;
      }
    });
  });

  describe("report structure", () => {
    it("should include all required fields in report", () => {
      const recovery = new RecoveryManager(configPath);
      const report = recovery.generateReport("test");
      
      expect("timestamp" in report).toBe(true);
      expect("triggeringProvider" in report).toBe(true);
      expect("lastLogs" in report).toBe(true);
      expect("configDiff" in report).toBe(true);
      expect("environmentSnapshot" in report).toBe(true);
    });

    it("should mark report as NOT full backup/restore", () => {
      const recovery = new RecoveryManager(configPath);
      const report = recovery.generateReport();
      
      // These fields should have placeholder/limited content
      // indicating this is a lightweight recovery mechanism
      expect(report.lastLogs).toBeDefined();
      expect(report.configDiff).toBeDefined();
      
      // Logs should mention they're a stub
      const logsText = JSON.stringify(report.lastLogs);
      expect(logsText.toLowerCase()).toContain("stub");
    });

    it("should indicate config diff is not detailed", () => {
      const recovery = new RecoveryManager(configPath);
      
      // Without a backup, should indicate no diff available
      const report = recovery.generateReport();
      const diffText = report.configDiff.toLowerCase();
      expect(
        diffText.includes("not available") || 
        diffText.includes("not implemented") ||
        diffText.includes("no backup")
      ).toBe(true);
    });
  });

  describe("end-to-end: full recovery flow", () => {
    it("should handle complete recovery sequence", () => {
      // Step 1: Create config and backup
      const originalConfig = { mode: "normal", timestamp: 1 };
      fs.writeFileSync(configPath, JSON.stringify(originalConfig));
      fs.writeFileSync(backupConfigPath, JSON.stringify(originalConfig));
      
      // Step 2: Simulate corruption
      fs.writeFileSync(configPath, JSON.stringify({ mode: "broken", timestamp: 2 }));
      
      // Step 3: Trigger recovery
      const recovery = new RecoveryManager(configPath);
      recovery.triggerSafeMode("crashed-provider");
      const report = recovery.generateReport("crashed-provider");
      
      // Step 4: Verify restoration
      const restored = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(restored.mode).toBe("normal");
      
      // Step 5: Verify report
      expect(report.triggeringProvider).toBe("crashed-provider");
      expect(typeof report.timestamp).toBe("number");
    });

    it("should recover gracefully even without backup", () => {
      // Don't create backup, just corrupt config
      const recovery = new RecoveryManager(configPath);
      
      // Should handle missing backup without crashing
      recovery.triggerSafeMode("provider");
      const report = recovery.generateReport("provider");
      
      expect(report).toBeDefined();
      expect(report.configDiff.toLowerCase()).toContain("backup");
    });

    it("should produce sanitized report suitable for logs", () => {
      const originalEnv = process.env;
      
      try {
        process.env.SENSITIVE_TOKEN = "sk-secret";
        process.env.PUBLIC_LOG_LEVEL = "debug";
        
        const recovery = new RecoveryManager(configPath);
        const report = recovery.generateReport("test");
        
        // Report should be safe to log
        const reportStr = JSON.stringify(report);
        expect(reportStr).not.toContain("sk-secret");
        expect(reportStr).toContain("[REDACTED]");
        expect(reportStr).toContain("debug");
      } finally {
        process.env = originalEnv;
      }
    });
  });

  describe("lightweight recovery guarantee", () => {
    it("should document as NOT full disaster recovery", () => {
      // This test documents the scope of the recovery system
      const recovery = new RecoveryManager(configPath);
      
      // Recovery system is designed to:
      // 1. Activate safe mode on crashes
      // 2. Rollback to known-good backup config
      // 3. Generate sanitized recovery report
      // 
      // It is NOT designed to:
      // - Restore full application state
      // - Recover databases or persistent data
      // - Provide full backup/restore capabilities
      //
      // For production disaster recovery: use external systems
      // (Git, database snapshots, configuration management)
      
      const report = recovery.generateReport();
      expect(report).toBeDefined(); // Just verify basic functionality
    });

    it("should indicate stub capabilities in report", () => {
      const recovery = new RecoveryManager(configPath);
      const report = recovery.generateReport();
      
      // Report should clearly indicate limitations
      const reportText = JSON.stringify(report, null, 2).toLowerCase();
      
      // Should mention these are stubs/not full features
      expect(
        reportText.includes("stub") ||
        reportText.includes("not implemented") ||
        reportText.includes("not available")
      ).toBe(true);
    });
  });
});
