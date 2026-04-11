import { execSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createCodingMetricsTool } from "./coding-metrics-tool.js";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
  },
  existsSync: vi.fn(),
}));

describe("coding_metrics tool", () => {
  it("returns git metrics when .git exists", async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (execSync as any).mockImplementation((cmd: string) => {
      if (cmd === "git status --porcelain") {
        return Buffer.from(
          " M src/agents/tools/common.ts\n?? src/agents/tools/receipt-tool.ts\n D old-file.ts",
        );
      }
      if (cmd === "git diff --stat") {
        return Buffer.from("3 files changed, 25 insertions(+), 10 deletions(-)");
      }
      return Buffer.from("");
    });

    const tool = createCodingMetricsTool();
    const result = await tool.execute("call1", {});

    const details = result.details as Record<string, any>;
    expect(details.type).toBe("git");
    expect(details.summary.modified).toBe(1);
    expect(details.summary.added).toBe(1);
    expect(details.summary.deleted).toBe(1);
    expect(details.changedFiles).toHaveLength(3);
    expect(details.diffStats).toContain("3 files changed");
  });

  it("returns empty metrics when .git does not exist", async () => {
    (fs.existsSync as any).mockReturnValue(false);

    const tool = createCodingMetricsTool();
    const result = await tool.execute("call2", {});

    const details = result.details as Record<string, any>;
    expect(details.type).toBe("none");
    expect(details.summary.total).toBe(0);
    expect(details.changedFiles).toHaveLength(0);
  });
});
