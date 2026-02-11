import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const SRC_ROOT = path.resolve(process.cwd(), "src");

const ALLOWED_TOOL_EXECUTE_FILES = new Set([
  "src/rfsn/dispatch.ts",
  "src/agents/pi-tool-definition-adapter.ts",
  "src/agents/pi-tools.read.ts",
]);

const ALLOWED_NODE_INVOKE_FILES = new Set(["src/gateway/node-command-kernel-gate.ts"]);
const RFSN_CHOKEPOINT_FILES = new Set([
  "src/agents/pi-embedded-runner/run/attempt.ts",
  "src/agents/pi-embedded-runner/compact.ts",
  "src/auto-reply/reply/bash-command.ts",
  "src/auto-reply/reply/get-reply-inline-actions.ts",
  "src/gateway/tools-invoke-http.ts",
]);
const RFSN_AGENT_TOOL_ROOT = "src/agents/tools/";
const HIGH_RISK_EXTENSION_SPAWN_FILES = [
  "extensions/voice-call/src/tunnel.ts",
  "extensions/voice-call/src/webhook.ts",
  "extensions/lobster/src/lobster-tool.ts",
  "extensions/zalouser/src/zca.ts",
] as const;
const HIGH_RISK_RUNTIME_SPAWN_FILES = [
  "src/acp/client.ts",
  "src/infra/ssh-config.ts",
  "src/infra/ssh-tunnel.ts",
  "src/hooks/gmail-watcher.ts",
  "src/hooks/gmail-ops.ts",
  "src/signal/daemon.ts",
  "src/imessage/client.ts",
  "src/auto-reply/reply/stage-sandbox-media.ts",
  "src/agents/sandbox/docker.ts",
] as const;
const LOOPBACK_DEFAULT_HOST_FILES = [
  "src/telegram/webhook.ts",
  "extensions/nextcloud-talk/src/monitor.ts",
  "extensions/msteams/src/monitor.ts",
  "extensions/feishu/src/monitor.ts",
  "src/canvas-host/server.ts",
  "src/media/server.ts",
] as const;
const WEBHOOK_BODY_LIMIT_FILES = [
  {
    file: "src/telegram/webhook.ts",
    marker: "DEFAULT_WEBHOOK_MAX_BODY_BYTES",
  },
  {
    file: "extensions/nextcloud-talk/src/monitor.ts",
    marker: "DEFAULT_WEBHOOK_MAX_BODY_BYTES",
  },
  {
    file: "extensions/feishu/src/monitor.ts",
    marker: "DEFAULT_FEISHU_WEBHOOK_MAX_BODY_BYTES",
  },
] as const;

const RUNTIME_TS_FILE_RE = /\.ts$/;
const TEST_FILE_RE = /\.(test|spec)\.ts$|\.e2e\.test\.ts$/;

function toPosixRelative(absPath: string): string {
  const rel = path.relative(process.cwd(), absPath);
  return rel.split(path.sep).join("/");
}

async function listRuntimeTsFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!RUNTIME_TS_FILE_RE.test(entry.name)) {
        continue;
      }
      if (TEST_FILE_RE.test(entry.name)) {
        continue;
      }
      files.push(absPath);
    }
  }

  return files;
}

describe("RFSN final authority", () => {
  test("tool execution and node invoke only happen at kernel choke points", async () => {
    const files = await listRuntimeTsFiles(SRC_ROOT);
    const violations: string[] = [];

    for (const absPath of files) {
      const relPath = toPosixRelative(absPath);
      const content = await fs.readFile(absPath, "utf8");

      const hasNodeInvoke = /\bnodeRegistry\.invoke\(/.test(content);
      if (hasNodeInvoke && !ALLOWED_NODE_INVOKE_FILES.has(relPath)) {
        violations.push(`${relPath}: nodeRegistry.invoke bypasses kernel gate`);
      }

      const hasToolExecuteCall = /\.execute(?:\?\.)?\(/.test(content);
      if (hasToolExecuteCall && !ALLOWED_TOOL_EXECUTE_FILES.has(relPath)) {
        violations.push(`${relPath}: direct tool.execute bypasses rfsnDispatch`);
      }

      const hasAutoWhitelistAllTools = /allowTools\s*:\s*toolsRaw\.map\(/.test(content);
      const hasExplicitEscapeHatch = /OPENCLAW_RFSN_AUTOWHITELIST_ALL_TOOLS/.test(content);
      if (hasAutoWhitelistAllTools && !hasExplicitEscapeHatch) {
        violations.push(
          `${relPath}: auto-whitelists all tools and weakens kernel policy without explicit escape hatch`,
        );
      }

      if (RFSN_CHOKEPOINT_FILES.has(relPath)) {
        if (/from\s+["']node:child_process["']/.test(content)) {
          violations.push(`${relPath}: chokepoint imports node:child_process directly`);
        }
        if (/\bfetch\(/.test(content)) {
          violations.push(`${relPath}: chokepoint calls raw fetch() directly`);
        }
      }

      if (relPath.startsWith(RFSN_AGENT_TOOL_ROOT)) {
        if (/\bfetch\(/.test(content)) {
          violations.push(`${relPath}: agent tool calls raw fetch() (use fetchWithSsrFGuard)`);
        }
        if (/from\s+["']node:child_process["']/.test(content)) {
          violations.push(
            `${relPath}: agent tool imports node:child_process directly (route via kernel-approved tool path)`,
          );
        }
        if (/\b(?:http\.)?createServer\(/.test(content)) {
          violations.push(
            `${relPath}: agent tool creates raw HTTP server (route via kernel-approved local-server helpers)`,
          );
        }
      }
    }

    for (const relPath of HIGH_RISK_EXTENSION_SPAWN_FILES) {
      const absPath = path.resolve(process.cwd(), relPath);
      const content = await fs.readFile(absPath, "utf8");
      if (/from\s+["']node:child_process["']/.test(content)) {
        violations.push(`${relPath}: direct node:child_process import bypasses subprocess guard`);
      }
      if (!/security\/subprocess\.js/.test(content)) {
        violations.push(`${relPath}: missing subprocess guard import`);
      }
    }

    for (const relPath of HIGH_RISK_RUNTIME_SPAWN_FILES) {
      const absPath = path.resolve(process.cwd(), relPath);
      const content = await fs.readFile(absPath, "utf8");
      if (/from\s+["']node:child_process["']/.test(content)) {
        violations.push(`${relPath}: direct node:child_process import bypasses subprocess guard`);
      }
      if (!/security\/subprocess\.js/.test(content)) {
        violations.push(`${relPath}: missing subprocess guard import`);
      }
    }

    for (const relPath of LOOPBACK_DEFAULT_HOST_FILES) {
      const absPath = path.resolve(process.cwd(), relPath);
      const content = await fs.readFile(absPath, "utf8");
      if (
        /(?:DEFAULT_[A-Z_]*HOST|bindHost|listenHost|const host)\s*[:=][^;\n]*["']0\.0\.0\.0["']/.test(
          content,
        )
      ) {
        violations.push(`${relPath}: defaults host bind to 0.0.0.0 instead of loopback`);
      }
    }

    for (const entry of WEBHOOK_BODY_LIMIT_FILES) {
      const absPath = path.resolve(process.cwd(), entry.file);
      const content = await fs.readFile(absPath, "utf8");
      if (!content.includes(entry.marker)) {
        violations.push(`${entry.file}: missing webhook request body size limit marker`);
      }
    }

    expect(violations).toEqual([]);
  });
});
