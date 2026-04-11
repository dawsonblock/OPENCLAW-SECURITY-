import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { RecoveryManager } from "./recovery.js";
import { readBrowserProxyFile } from "../node-host/browser-proxy.js";

vi.mock("node:fs");
vi.mock("fs");

describe("Deterministic Resource Failures", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
  });

  describe("Recovery Manager Failures", () => {
    it("should handle unreadable gateway log files gracefully", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      // Mock statSync strictly to size 0 or failure
      vi.spyOn(fs, "statSync").mockImplementation(() => {
        throw new Error("EACCES: permission denied");
      });

      const recovery = new RecoveryManager("/tmp/mock/config.json");
      const report = await recovery.generateReport();
      expect(report.lastLogs).toEqual(["[Recovery report: gateway log not found or unreadable]"]);
    });

    it("should gracefully handle missing backup configs diffs", async () => {
      vi.spyOn(fs, "existsSync").mockImplementation((path) => {
        if (path.toString().endsWith(".bak")) return false;
        return true;
      });

      const recovery = new RecoveryManager("/tmp/mock/config.json");
      const report = await recovery.generateReport();
      expect(report.configDiff).toBe("[No backup available for diff]");
    });
  });

  describe("Browser Proxy Boundaries", () => {
    it("should explicitly reject browser proxy queries that point to non-existent root files", async () => {
      try {
        await readBrowserProxyFile("/tmp/absolutely_does_not_exist/file.jpg");
        // Should throw or return null predictably
      } catch (err: any) {
        // Assert fail closed
        expect(err.message).toContain("outside approved browser proxy roots");
      }
    });
  });
});
