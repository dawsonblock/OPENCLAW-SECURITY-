import path from "node:path";

/**
 * This importer-boundary proof covers the shipped Node/TypeScript runtime under
 * src/ and extensions/. Native apps under apps/ and package wrapper scripts
 * under packages/ are reviewed by other guards and stay outside this path-only
 * TypeScript authority scan.
 */
export const AUTHORITY_BOUNDARY_SCAN_ROOTS = ["src", "extensions"] as const;

export const REVIEWED_CHILD_PROCESS_IMPORTERS = [
  "src/security/subprocess.ts",
  "src/process/spawn-utils.ts",
  "src/tui/tui-local-shell.ts",
  "src/entry.ts",
] as const;

export const REVIEWED_AUTHORITY_IMPORTERS = {
  "src/process/spawn-utils.ts": [
    "src/agents/bash-tools.exec.runtime.ts",
    "src/process/exec.ts",
  ],
  "src/tui/tui-local-shell.ts": ["src/tui/tui.ts"],
  "src/entry.ts": [],
} as const satisfies Record<string, readonly string[]>;

export const FORBIDDEN_AUTHORITY_IMPORT_ROOTS = [
  "src/gateway/",
  "src/node-host/",
  "src/rfsn/",
  "src/agents/tools/",
] as const;

export const AUTHORITY_EXCEPTION_TARGETS = Object.keys(
  REVIEWED_AUTHORITY_IMPORTERS,
) as Array<keyof typeof REVIEWED_AUTHORITY_IMPORTERS>;

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
