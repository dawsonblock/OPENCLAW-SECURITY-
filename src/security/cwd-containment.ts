/**
 * CWD containment for execution planes.
 *
 * Validates that the working directory for a tool invocation
 * is contained within the configured workspace root, preventing
 * path traversal and symlink escape attacks.
 */

import fs from "node:fs/promises";
import path from "node:path";

export type CwdValidationResult = { ok: true; resolvedCwd: string } | { ok: false; reason: string };

/**
 * Validate that a CWD path is safely contained within the workspace root.
 *
 * - Resolves realpath of both cwd and root to defeat symlink traversal
 * - Rejects paths that escape the root after resolution
 * - Rejects absolute paths outside root
 * - Falls back to workspaceRoot if cwd is empty/missing
 */
export async function validateExecCwd(
  cwd: string | undefined | null,
  workspaceRoot: string,
): Promise<CwdValidationResult> {
  if (!workspaceRoot || !workspaceRoot.trim()) {
    return { ok: false, reason: "workspace root is not configured" };
  }

  let rootReal: string;
  try {
    rootReal = await fs.realpath(workspaceRoot);
  } catch {
    return { ok: false, reason: "workspace root directory does not exist" };
  }

  const rootWithSep = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;

  // If no cwd provided, default to workspace root
  if (!cwd || !cwd.trim()) {
    return { ok: true, resolvedCwd: rootReal };
  }

  const trimmed = cwd.trim();

  // Resolve relative paths against workspace root
  const resolved = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(rootReal, trimmed);

  // Check resolved path is within root (before realpath, catches obvious traversals)
  if (resolved !== rootReal && !resolved.startsWith(rootWithSep)) {
    return {
      ok: false,
      reason: `cwd "${trimmed}" resolves outside workspace root`,
    };
  }

  // Verify the directory exists
  let cwdReal: string;
  try {
    cwdReal = await fs.realpath(resolved);
  } catch {
    // Directory doesn't exist — reject
    return {
      ok: false,
      reason: `cwd "${trimmed}" does not exist`,
    };
  }

  // After realpath, verify we're still within root (defeats symlink escapes)
  if (cwdReal !== rootReal && !cwdReal.startsWith(rootWithSep)) {
    return {
      ok: false,
      reason: `cwd "${trimmed}" escapes workspace root via symlink`,
    };
  }

  // Verify it's actually a directory
  try {
    const stat = await fs.stat(cwdReal);
    if (!stat.isDirectory()) {
      return {
        ok: false,
        reason: `cwd "${trimmed}" is not a directory`,
      };
    }
  } catch {
    return {
      ok: false,
      reason: `cwd "${trimmed}" is not accessible`,
    };
  }

  return { ok: true, resolvedCwd: cwdReal };
}

/**
 * Resolve the workspace root from config or environment.
 * Returns undefined if no root was configured.
 */
export function resolveWorkspaceRoot(
  configRoot: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (configRoot?.trim()) {
    return configRoot.trim();
  }
  const envRoot = env.OPENCLAW_WORKSPACE_ROOT?.trim();
  if (envRoot) {
    return envRoot;
  }
  return undefined;
}
