import fs from "node:fs";
import path from "node:path";
import { ensureOpenClawCliOnPath } from "../infra/path-env.js";
import { SAFE_ENV_KEYS } from "../security/exec-env-allowlist.js";
import { DEFAULT_NODE_PATH } from "./types.js";

export function sanitizeEnv(
  overrides: Record<string, string> | null | undefined,
  allowArbitrary = false,
): Record<string, string> | undefined {
  const filterEnv = (input: NodeJS.ProcessEnv) => {
    const result: Record<string, string> = {};
    for (const key of SAFE_ENV_KEYS) {
      const val = input[key];
      if (typeof val === "string") {
        result[key] = val;
      }
    }
    return result;
  };

  if (!overrides && !allowArbitrary) {
    return filterEnv(process.env);
  }

  const base = allowArbitrary
    ? ({ ...process.env } as Record<string, string>)
    : filterEnv(process.env);

  if (!overrides) {
    return base;
  }

  const merged = { ...base };
  const basePath = process.env.PATH ?? DEFAULT_NODE_PATH;

  for (const [rawKey, value] of Object.entries(overrides)) {
    const key = rawKey.trim();
    if (!key) {
      continue;
    }

    if (key.toUpperCase() === "PATH") {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      if (!basePath || trimmed === basePath) {
        merged[key] = trimmed;
        continue;
      }
      const suffix = `${path.delimiter}${basePath}`;
      if (trimmed.endsWith(suffix)) {
        merged[key] = trimmed;
      }
      continue;
    }

    if (allowArbitrary) {
      merged[key] = value;
      continue;
    }

    if (SAFE_ENV_KEYS.has(key)) {
      merged[key] = value;
    }
  }
  return merged;
}

export function resolveEnvPath(env?: Record<string, string>): string[] {
  const raw =
    env?.PATH ??
    (env as Record<string, string>)?.Path ??
    process.env.PATH ??
    process.env.Path ??
    DEFAULT_NODE_PATH;
  return raw.split(path.delimiter).filter(Boolean);
}

export function ensureNodePathEnv(): string {
  ensureOpenClawCliOnPath({ pathEnv: process.env.PATH ?? "" });
  const current = process.env.PATH ?? "";
  if (current.trim()) {
    return current;
  }
  process.env.PATH = DEFAULT_NODE_PATH;
  return DEFAULT_NODE_PATH;
}

export function resolveExecutable(bin: string, env?: Record<string, string>) {
  if (bin.includes("/") || bin.includes("\\")) {
    return null;
  }
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? process.env.PathExt ?? ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .map((ext) => ext.toLowerCase())
      : [""];
  for (const dir of resolveEnvPath(env)) {
    for (const ext of extensions) {
      const candidate = path.join(dir, bin + ext);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}
