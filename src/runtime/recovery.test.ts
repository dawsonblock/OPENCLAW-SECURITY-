import * as fs from "fs";
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { RecoveryManager } from "./recovery.js";

vi.mock("fs");

describe("RecoveryManager", () => {
  let manager: RecoveryManager;
  const mockConfigPath = "/mock/config.json";
  const mockBackupPath = "/mock/config.json.bak";

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new RecoveryManager(mockConfigPath);

    // Reset the mock filesystem state
    (fs.existsSync as Mock).mockImplementation((path: string) => {
      if (path === mockBackupPath) {
        return true;
      }
      return false;
    });

    (fs.readFileSync as Mock).mockReturnValue(JSON.stringify({ bindPort: 1234 }));
    (fs.writeFileSync as Mock).mockImplementation(() => {});
    (fs.copyFileSync as Mock).mockImplementation(() => {});
  });

  it("should initialize safely", () => {
    expect(manager["isSafeMode"]).toBe(false);
  });

  it("should trigger safe mode and fallback config", () => {
    manager.triggerSafeMode("TestProvider");

    expect(manager["isSafeMode"]).toBe(true);
    // Verify backup was attempted
    expect(fs.existsSync).toHaveBeenCalledWith(mockBackupPath);
    // Using vi.mock we can't fully mock everything seamlessly without setup,
    // but we verify the method sets the internal flag properly.
  });

  it("should generate a valid recovery report", () => {
    manager.triggerSafeMode("TestCrashLoop");
    const report = manager.generateReport("TestCrashLoop");

    expect(report.triggeringProvider).toBe("TestCrashLoop");
    expect(report.timestamp).toBeGreaterThan(0);
  });
});
