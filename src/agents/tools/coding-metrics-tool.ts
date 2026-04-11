import { Type } from "@sinclair/typebox";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";

const CodingMetricsToolSchema = Type.Object({
  workspaceDir: Type.Optional(
    Type.String({
      description: "The root directory of the workspace (defaults to current workdir).",
    }),
  ),
});

export function createCodingMetricsTool(opts?: { workspaceDir?: string }): AnyAgentTool {
  return {
    label: "Coding Metrics",
    name: "coding_metrics",
    description:
      "Gather metrics about the current coding session, including changed files and diff stats.",
    parameters: CodingMetricsToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const workspaceDir = (params.workspaceDir as string) || opts?.workspaceDir || process.cwd();

      let gitMetrics: Record<string, unknown> | null = null;
      try {
        // Check if git is available and it's a repo
        if (fs.existsSync(path.join(workspaceDir, ".git"))) {
          const status = execSync("git status --porcelain", { cwd: workspaceDir })
            .toString()
            .trim();
          const lines = status.split("\n").filter(Boolean);

          const changedFiles = lines.map((line) => line.substring(3));
          const summary = {
            modified: lines.filter((l) => l.startsWith(" M") || l.startsWith("M ")).length,
            added: lines.filter((l) => l.startsWith("??") || l.startsWith("A ")).length,
            deleted: lines.filter((l) => l.startsWith(" D") || l.startsWith("D ")).length,
            total: lines.length,
          };

          let diffStats = "";
          try {
            diffStats = execSync("git diff --stat", { cwd: workspaceDir }).toString().trim();
          } catch {
            // No diff if no commits or other issues
          }

          gitMetrics = {
            type: "git",
            changedFiles,
            summary,
            diffStats,
          };
        }
      } catch (err) {
        // Git failed or not found, fallback to empty
      }

      if (!gitMetrics) {
        // Fallback or non-git metrics could be added here (e.g., file system scan)
        gitMetrics = {
          type: "none",
          changedFiles: [],
          summary: { modified: 0, added: 0, deleted: 0, total: 0 },
          diffStats: "No git repository found.",
        };
      }

      return jsonResult(gitMetrics);
    },
  };
}
