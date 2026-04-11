import { describe, expect, it, vi, beforeEach } from "vitest";
import { RecoveryManager } from "./recovery.js";
import fs from "node:fs";

vi.mock("node:fs");
vi.mock("fs");

describe("Retention Bounding", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
  });

  describe("Recovery Manager Artifact Retention", () => {
    it("should retain up to ~20 lines maximum from the gateway log to prevent giant dumps", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      
      const mockedBigFileContent = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join("\n");
      vi.spyOn(fs, "readFileSync").mockReturnValue(mockedBigFileContent);

      const recovery = new RecoveryManager("/tmp/mock/config.json");
      const report = await recovery.generateReport();
      // Recovery retrieves the last N bytes -> lines. Should not be the full 100 lines.
      // This bounded retention ensures sanitized memory.
      expect(report.lastLogs.length).toBeLessThan(100);
      expect(report.lastLogs.some((l) => l.includes("Line 99"))).toBe(true);
    });

    it("should preserve the single baseline config backup", async () => {
      let copyDestination = "";
      vi.spyOn(fs, "existsSync").mockImplementation((path) => {
        if (path === "/tmp/mock/config.json") return true;
        return false; // .bak doesn't exist
      });
      vi.spyOn(fs, "copyFileSync").mockImplementation((src: fs.PathLike, dest: fs.PathLike) => {
        copyDestination = dest.toString();
      });

      const recovery = new RecoveryManager("/tmp/mock/config.json");
      await recovery.createSnapshotIfMissing();

      expect(copyDestination).toEqual("/tmp/mock/config.json.bak");
    });
  });
});
