import path from "node:path";
import type { ExecAsk, ExecHost, ExecSecurity } from "../infra/exec-approvals.js";

export function normalizeExecHost(value?: string | null): ExecHost | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "sandbox" || normalized === "gateway" || normalized === "node") {
    return normalized;
  }
  return null;
}

export function normalizeExecSecurity(value?: string | null): ExecSecurity | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "deny" || normalized === "allowlist" || normalized === "full") {
    return normalized;
  }
  return null;
}

export function normalizeExecAsk(value?: string | null): ExecAsk | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "off" || normalized === "on-miss" || normalized === "always") {
    return normalized as ExecAsk;
  }
  return null;
}

export function renderExecHostLabel(host: ExecHost) {
  return host === "sandbox" ? "sandbox" : host === "gateway" ? "gateway" : "node";
}

export function normalizeNotifyOutput(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizePathPrepend(entries?: string[]) {
  if (!Array.isArray(entries)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

export function mergePathPrepend(existing: string | undefined, prepend: string[]) {
  if (prepend.length === 0) {
    return existing;
  }
  const partsExisting = (existing ?? "")
    .split(path.delimiter)
    .map((part) => part.trim())
    .filter(Boolean);
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const part of [...prepend, ...partsExisting]) {
    if (seen.has(part)) {
      continue;
    }
    seen.add(part);
    merged.push(part);
  }
  return merged.join(path.delimiter);
}

export function applyPathPrepend(
  env: Record<string, string>,
  prepend: string[],
  options?: { requireExisting?: boolean },
) {
  if (prepend.length === 0) {
    return;
  }
  if (options?.requireExisting && !env.PATH) {
    return;
  }
  const merged = mergePathPrepend(env.PATH, prepend);
  if (merged) {
    env.PATH = merged;
  }
}

export function applyShellPath(env: Record<string, string>, shellPath?: string | null) {
  if (!shellPath) {
    return;
  }
  const entries = shellPath
    .split(path.delimiter)
    .map((part) => part.trim())
    .filter(Boolean);
  if (entries.length === 0) {
    return;
  }
  const merged = mergePathPrepend(env.PATH, entries);
  if (merged) {
    env.PATH = merged;
  }
}
