import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const SRC_ROOT = path.resolve(process.cwd(), "src");
const EXTENSIONS_ROOT = path.resolve(process.cwd(), "extensions");

const ALLOWED_TOOL_EXECUTE_FILES = new Set([
  "src/rfsn/dispatch.ts",
  "src/agents/pi-tool-definition-adapter.ts",
  "src/agents/pi-tools.read.ts",
  "src/agents/pi-tools.replay.ts",
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
const SECURE_INSTALLER_RULES = [
  {
    file: "src/plugins/install.ts",
    markers: [
      "--ignore-scripts",
      "inheritProcessEnv: false",
      "OPENCLAW_ALLOW_UNSAFE_PLUGIN_INSTALL",
      "buildScrubbedEnv",
    ],
  },
  {
    file: "src/hooks/install.ts",
    markers: [
      "--ignore-scripts",
      "inheritProcessEnv: false",
      "OPENCLAW_ALLOW_UNSAFE_PLUGIN_INSTALL",
      "buildScrubbedEnv",
    ],
  },
  {
    file: "src/infra/update-runner.ts",
    markers: [
      "buildScrubbedEnv",
      "inheritProcessEnv: scrubNpmInstall ? false",
      "npm_config_ignore_scripts",
    ],
  },
  {
    file: "src/cli/update-cli.ts",
    markers: [
      "buildScrubbedEnv",
      "inheritProcessEnv: scrubNpmInstall ? false",
      "npm_config_ignore_scripts",
    ],
  },
] as const;
const SECURE_EXTENSION_INSTALLER_RULES = [
  {
    file: "extensions/matrix/src/matrix/deps.ts",
    markers: [
      "--ignore-scripts",
      "inheritProcessEnv: scrubEnv ? false",
      "npm_config_ignore_scripts",
    ],
  },
] as const;
const BROWSER_EXPOSURE_RULES = {
  file: "scripts/sandbox-browser-entrypoint.sh",
  requiredMarkers: [
    "OPENCLAW_BROWSER_CDP_TOKEN",
    "OPENCLAW_BROWSER_NOVNC_TOKEN",
    "OPENCLAW_BROWSER_ALLOW_INSECURE_CDP_LAN",
    "OPENCLAW_BROWSER_ALLOW_INSECURE_NOVNC_LAN",
    "browser-auth-proxy.mjs",
  ],
  bannedMarkers: ["token is advisory here"],
} as const;
const QUERY_SECRET_HARDENING_RULES = [
  {
    file: "extensions/bluebubbles/src/types.ts",
    markers: [
      "OPENCLAW_BLUEBUBBLES_LEGACY_QUERY_AUTH",
      'searchParams.delete("password")',
      "X-BlueBubbles-Password",
    ],
  },
  {
    file: "src/hooks/gmail-setup-utils.ts",
    markers: ["OPENCLAW_GMAIL_PUSH_ENDPOINT_QUERY_TOKEN"],
  },
] as const;
const RFSN_RUNTIME_CAPABILITY_RULES = [
  {
    file: "src/agents/pi-embedded-runner/run/attempt.ts",
    markers: [
      "resolveRfsnRuntimeCapabilities",
      "channelCapabilities: runtimeCapabilities",
      "messageToolEnabled: !params.disableMessageTool",
      "createAndBootstrapDefaultPolicy",
      "createGatedTools",
    ],
  },
  {
    file: "src/agents/pi-embedded-runner/compact.ts",
    markers: [
      "resolveRfsnRuntimeCapabilities",
      "channelCapabilities: runtimeCapabilities",
      "createAndBootstrapDefaultPolicy",
      "createGatedTools",
    ],
  },
  {
    file: "src/auto-reply/reply/get-reply-inline-actions.ts",
    markers: [
      "resolveRfsnRuntimeCapabilities",
      "resolveChannelCapabilities",
      "channelCapabilities: runtimeCapabilities",
      "createAndBootstrapDefaultPolicy",
    ],
  },
  {
    file: "src/auto-reply/reply/bash-command.ts",
    markers: ["resolveRfsnRuntimeCapabilities", "createAndBootstrapDefaultPolicy"],
  },
  {
    file: "src/gateway/tools-invoke-http.ts",
    markers: [
      "resolveRfsnRuntimeCapabilities",
      "resolveChannelCapabilities",
      "channelCapabilities: runtimeCapabilities",
      "createAndBootstrapDefaultPolicy",
    ],
  },
] as const;

const RFSN_GATED_FACTORY_RULES = [
  {
    file: "src/agents/tools/index.gated.ts",
    markers: ["wrapToolsWithRfsnGate", "createGatedTools"],
  },
] as const;

// Every chokepoint file must contain at least one of these gate-routing markers.
// This proves the file routes through the kernel gate.
const RFSN_CHOKEPOINT_GATE_MARKERS = ["rfsnDispatch", "createGatedTools"] as const;

// Env vars that control gate behaviour — agent tool files must not assign these.
const GATE_CRITICAL_ENV_VARS = [
  "OPENCLAW_RFSN_AUTOWHITELIST_ALL_TOOLS",
  "OPENCLAW_RFSN_ADAPTIVE_RISK",
  "OPENCLAW_RFSN_REQUIRE_SIGNED_POLICY",
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

      if (
        relPath.startsWith("src/agents/") &&
        relPath !== "src/agents/tools/index.gated.ts" &&
        /wrapToolsWithRfsnGate\(/.test(content)
      ) {
        violations.push(
          `${relPath}: runtime should use createGatedTools instead of calling wrapToolsWithRfsnGate directly`,
        );
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

      if (/\bnew Function\(/.test(content) || /\beval\(/.test(content)) {
        violations.push(
          `${relPath}: runtime code contains dynamic JavaScript execution primitives (eval/new Function)`,
        );
      }
      if (/\bexecSync\(/.test(content)) {
        violations.push(
          `${relPath}: runtime code contains execSync() (use execFileSync or wrappers)`,
        );
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

    for (const entry of SECURE_INSTALLER_RULES) {
      const absPath = path.resolve(process.cwd(), entry.file);
      const content = await fs.readFile(absPath, "utf8");
      for (const marker of entry.markers) {
        if (!content.includes(marker)) {
          violations.push(`${entry.file}: missing hardened installer marker "${marker}"`);
        }
      }
    }

    for (const entry of SECURE_EXTENSION_INSTALLER_RULES) {
      const absPath = path.resolve(process.cwd(), entry.file);
      const content = await fs.readFile(absPath, "utf8");
      for (const marker of entry.markers) {
        if (!content.includes(marker)) {
          violations.push(`${entry.file}: missing hardened installer marker "${marker}"`);
        }
      }
    }

    const browserScriptPath = path.resolve(process.cwd(), BROWSER_EXPOSURE_RULES.file);
    const browserScript = await fs.readFile(browserScriptPath, "utf8");
    for (const marker of BROWSER_EXPOSURE_RULES.requiredMarkers) {
      if (!browserScript.includes(marker)) {
        violations.push(
          `${BROWSER_EXPOSURE_RULES.file}: missing browser exposure hardening marker "${marker}"`,
        );
      }
    }
    for (const marker of BROWSER_EXPOSURE_RULES.bannedMarkers) {
      if (browserScript.includes(marker)) {
        violations.push(
          `${BROWSER_EXPOSURE_RULES.file}: found insecure browser exposure marker "${marker}"`,
        );
      }
    }

    for (const entry of QUERY_SECRET_HARDENING_RULES) {
      const absPath = path.resolve(process.cwd(), entry.file);
      const content = await fs.readFile(absPath, "utf8");
      for (const marker of entry.markers) {
        if (!content.includes(marker)) {
          violations.push(`${entry.file}: missing query secret hardening marker "${marker}"`);
        }
      }
    }

    for (const entry of RFSN_RUNTIME_CAPABILITY_RULES) {
      const absPath = path.resolve(process.cwd(), entry.file);
      const content = await fs.readFile(absPath, "utf8");
      for (const marker of entry.markers) {
        if (!content.includes(marker)) {
          violations.push(`${entry.file}: missing RFSN runtime capability marker "${marker}"`);
        }
      }
    }

    for (const entry of RFSN_GATED_FACTORY_RULES) {
      const absPath = path.resolve(process.cwd(), entry.file);
      const content = await fs.readFile(absPath, "utf8");
      for (const marker of entry.markers) {
        if (!content.includes(marker)) {
          violations.push(`${entry.file}: missing RFSN gated factory marker "${marker}"`);
        }
      }
    }

    // Extension runtime code should never use dynamic JS execution primitives or execSync.
    // Keep this narrow to avoid blocking legitimate subprocess wrappers that use spawn guards.
    const extensionRuntimeFiles = await listRuntimeTsFiles(EXTENSIONS_ROOT);
    for (const absPath of extensionRuntimeFiles) {
      const relPath = toPosixRelative(absPath);
      const content = await fs.readFile(absPath, "utf8");
      if (/\bnew Function\(/.test(content) || /\beval\(/.test(content)) {
        violations.push(
          `${relPath}: extension runtime code contains dynamic JavaScript execution primitives (eval/new Function)`,
        );
      }
      if (/\bexecSync\(/.test(content)) {
        violations.push(`${relPath}: extension runtime code contains execSync()`);
      }
      // Extensions must not call tool.execute directly (bypass gate).
      if (/\.execute(?:\?\.)?\(/.test(content)) {
        violations.push(
          `${relPath}: extension runtime contains direct tool.execute call (bypasses rfsnDispatch)`,
        );
      }
    }

    // Every chokepoint file must prove it routes through the kernel gate.
    for (const relPath of RFSN_CHOKEPOINT_FILES) {
      const absPath = path.resolve(process.cwd(), relPath);
      const content = await fs.readFile(absPath, "utf8");
      const hasGateMarker = RFSN_CHOKEPOINT_GATE_MARKERS.some((marker) => content.includes(marker));
      if (!hasGateMarker) {
        violations.push(
          `${relPath}: chokepoint file does not contain any gate routing marker (${RFSN_CHOKEPOINT_GATE_MARKERS.join(" | ")})`,
        );
      }
    }

    // Agent tool files must not mutate gate-critical env vars.
    for (const absPath of files) {
      const relPath = toPosixRelative(absPath);
      if (!relPath.startsWith(RFSN_AGENT_TOOL_ROOT)) {
        continue;
      }
      const content = await fs.readFile(absPath, "utf8");
      for (const envVar of GATE_CRITICAL_ENV_VARS) {
        // Detect process.env.VAR = ... (assignment, not just reads)
        const assignPattern = new RegExp(`process\\.env\\.${envVar}\\s*=`);
        if (assignPattern.test(content)) {
          violations.push(`${relPath}: agent tool mutates gate-critical env var ${envVar}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
