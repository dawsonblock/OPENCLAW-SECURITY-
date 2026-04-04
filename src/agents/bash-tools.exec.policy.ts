import {
  getShellPathFromLoginShell,
  resolveShellEnvFallbackTimeoutMs,
} from "../infra/shell-env.js";
import { SAFE_ENV_KEYS } from "../security/exec-env-allowlist.js";
import { buildSandboxEnv, coerceEnv } from "./bash-tools.shared.js";
import { applyPathPrepend, applyShellPath } from "./bash-tools.exec.normalize.js";
import type { ExecToolDefaults } from "./bash-tools.exec.types.js";

export const DANGEROUS_HOST_ENV_VARS = new Set([
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "LD_AUDIT",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "NODE_OPTIONS",
  "NODE_PATH",
  "PYTHONPATH",
  "PYTHONHOME",
  "RUBYLIB",
  "PERL5LIB",
  "BASH_ENV",
  "ENV",
  "GCONV_PATH",
  "IFS",
  "SSLKEYLOGFILE",
]);
export const DANGEROUS_HOST_ENV_PREFIXES = ["DYLD_", "LD_"];
export const DEFAULT_PATH =
  process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

export function validateHostEnv(env: Record<string, string>): void {
  for (const key of Object.keys(env)) {
    const upperKey = key.toUpperCase();
    if (DANGEROUS_HOST_ENV_PREFIXES.some((prefix) => upperKey.startsWith(prefix))) {
      throw new Error(
        `Security Violation: Environment variable '${key}' is forbidden during host execution.`,
      );
    }
    if (DANGEROUS_HOST_ENV_VARS.has(upperKey)) {
      throw new Error(
        `Security Violation: Environment variable '${key}' is forbidden during host execution.`,
      );
    }
    if (upperKey === "PATH") {
      throw new Error(
        "Security Violation: Custom 'PATH' variable is forbidden during host execution.",
      );
    }
  }
}

export function buildExecEnv(params: {
  defaults?: ExecToolDefaults;
  host: "sandbox" | "gateway" | "node";
  sandbox: ExecToolDefaults["sandbox"];
  containerWorkdir?: string | null;
  paramsEnv?: Record<string, string>;
  defaultPathPrepend: string[];
}) {
  const hostEnv = coerceEnv(process.env);
  const baseEnv: Record<string, string> = {};
  for (const key of SAFE_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(hostEnv, key)) {
      baseEnv[key] = hostEnv[key];
    }
  }
  if (params.host !== "sandbox" && params.paramsEnv) {
    validateHostEnv(params.paramsEnv);
  }
  const mergedEnv = params.paramsEnv ? { ...baseEnv, ...params.paramsEnv } : baseEnv;
  const env = params.sandbox
    ? buildSandboxEnv({
        defaultPath: DEFAULT_PATH,
        paramsEnv: params.paramsEnv,
        sandboxEnv: params.sandbox.env,
        containerWorkdir: params.containerWorkdir ?? params.sandbox.containerWorkdir,
      })
    : mergedEnv;
  if (!params.sandbox && params.host === "gateway" && !params.paramsEnv?.PATH) {
    const shellPath = getShellPathFromLoginShell({
      env: process.env,
      timeoutMs: resolveShellEnvFallbackTimeoutMs(process.env),
    });
    applyShellPath(env, shellPath);
  }
  applyPathPrepend(env, params.defaultPathPrepend);
  return env;
}
