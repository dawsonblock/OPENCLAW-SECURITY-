import path from "node:path";

/**
 * This authority-boundary scan intentionally covers the shipped server-side
 * TypeScript runtime roots that participate in the child-process trust model:
 * core runtime code in src/ plus Node-loaded extension code in extensions/.
 *
 * It intentionally does not treat the whole repository as one scan domain.
 * apps/ contains native mobile/macOS code, packages/ contains tiny JavaScript
 * compatibility shims that forward to the main package, and ui/ is browser
 * code; none of those directories are part of this path-based TypeScript
 * importer proof for the reviewed execution-authority exceptions.
 */
export const AUTHORITY_BOUNDARY_SCAN_ROOTS = ["src", "extensions"] as const;

export const REVIEWED_CHILD_PROCESS_IMPORTERS = [
  // Canonical subprocess authority wrapper reviewed as the narrow boundary for
  // spawning and process-management helpers used elsewhere in src/.
  "src/security/subprocess.ts",
  // Shared spawn helper reviewed to centralize child-process invocation logic
  // instead of permitting scattered direct imports across the codebase.
  "src/process/spawn-utils.ts",
  // TUI local-shell surface is an explicitly reviewed interactive feature that
  // intentionally launches a user-local shell from the terminal UI.
  "src/tui/tui-local-shell.ts",
  // Process entrypoint is reviewed because bootstrap/runtime startup may need
  // controlled child-process access before narrower modules take over.
  "src/entry.ts",
] as const;

export const REVIEWED_AUTHORITY_IMPORTERS = {
  "src/process/spawn-utils.ts": ["src/agents/bash-tools.exec.runtime.ts", "src/process/exec.ts"],
  "src/tui/tui-local-shell.ts": ["src/tui/tui.ts"],
  "src/entry.ts": [],
} as const satisfies Record<string, readonly string[]>;

export const FORBIDDEN_AUTHORITY_IMPORT_ROOTS = [
  "src/gateway/",
  "src/node-host/",
  "src/rfsn/",
  "src/agents/tools/",
] as const;

export const AUTHORITY_EXCEPTION_TARGETS = Object.keys(REVIEWED_AUTHORITY_IMPORTERS) as Array<
  keyof typeof REVIEWED_AUTHORITY_IMPORTERS
>;

/**
 * Normalize repo-relative paths to forward-slash form so tests and CI compare
 * the same strings on every platform.
 */
export function normalizeAuthorityBoundaryPath(filePath: string): string {
  return filePath.replaceAll(path.sep, "/");
}

/**
 * Convert an absolute path to the repo-relative form used by the shared
 * boundary rules. Tests and scripts can pass a custom cwd when they need to
 * normalize paths relative to a temporary checkout or explicit workspace root.
 */
export function toAuthorityBoundaryRepoPath(absPath: string, cwd = process.cwd()): string {
  return normalizeAuthorityBoundaryPath(path.relative(cwd, absPath));
}
