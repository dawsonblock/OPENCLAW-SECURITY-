import type { RuntimeEnv } from "openclaw/plugin-sdk";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMatrixRuntime } from "../runtime.js";

const MATRIX_SDK_PACKAGE = "@vector-im/matrix-bot-sdk";
const SCRUBBED_ENV_KEYS = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
] as const;

function buildScrubbedInstallEnv(allowNpmScripts: boolean): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of SCRUBBED_ENV_KEYS) {
    const value = process.env[key];
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  env.COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";
  env.COREPACK_ENABLE_STRICT = "0";
  if (!allowNpmScripts) {
    env.npm_config_ignore_scripts = "true";
    env.NPM_CONFIG_IGNORE_SCRIPTS = "true";
  }
  delete env.NODE_OPTIONS;
  delete env.LD_PRELOAD;
  delete env.DYLD_INSERT_LIBRARIES;
  delete env.DYLD_LIBRARY_PATH;
  return env;
}

export function isMatrixSdkAvailable(): boolean {
  try {
    const req = createRequire(import.meta.url);
    req.resolve(MATRIX_SDK_PACKAGE);
    return true;
  } catch {
    return false;
  }
}

function resolvePluginRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..", "..");
}

export async function ensureMatrixSdkInstalled(params: {
  runtime: RuntimeEnv;
  confirm?: (message: string) => Promise<boolean>;
}): Promise<void> {
  if (isMatrixSdkAvailable()) {
    return;
  }
  const confirm = params.confirm;
  if (confirm) {
    const ok = await confirm("Matrix requires @vector-im/matrix-bot-sdk. Install now?");
    if (!ok) {
      throw new Error("Matrix requires @vector-im/matrix-bot-sdk (install dependencies first).");
    }
  }

  const root = resolvePluginRoot();
  const allowNpmScripts = process.env.OPENCLAW_ALLOW_NPM_SCRIPTS === "1";
  const command = fs.existsSync(path.join(root, "pnpm-lock.yaml"))
    ? ["pnpm", "install"]
    : allowNpmScripts
      ? ["npm", "install", "--omit=dev", "--silent"]
      : ["npm", "install", "--omit=dev", "--silent", "--ignore-scripts"];
  const scrubEnv = command[0] === "npm";
  params.runtime.log?.(`matrix: installing dependencies via ${command[0]} (${root})…`);
  const result = await getMatrixRuntime().system.runCommandWithTimeout(command, {
    cwd: root,
    timeoutMs: 300_000,
    env: scrubEnv
      ? buildScrubbedInstallEnv(allowNpmScripts)
      : { COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
    inheritProcessEnv: scrubEnv ? false : undefined,
  });
  if (result.code !== 0) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || "Matrix dependency install failed.",
    );
  }
  if (!isMatrixSdkAvailable()) {
    throw new Error(
      "Matrix dependency install completed but @vector-im/matrix-bot-sdk is still missing.",
    );
  }
}
