import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  AUTHORITY_BOUNDARY_SCAN_ROOTS,
  REVIEWED_CHILD_PROCESS_IMPORTERS,
  toAuthorityBoundaryRepoPath,
} from "../src/security/authority-boundaries.js";

console.log("🔒 Running OpenCLAW Security Integrity Check...");

let failed = false;

// 2. Scan package.json for unsafe flags in production scripts
try {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const scripts = pkg.scripts || {};
  for (const [name, cmd] of Object.entries(scripts)) {
    if (typeof cmd === "string") {
      if (cmd.includes("NODE_TLS_REJECT_UNAUTHORIZED=0")) {
        console.error(`❌ Detailed TLS security disabled in script '${name}'`);
        failed = true;
      }
    }
  }
} catch (err) {
  console.error(`❌ Failed to parse package.json: ${String(err)}`);
  failed = true;
}

const ALLOWED_CHILD_PROCESS_IMPORTERS = new Set(REVIEWED_CHILD_PROCESS_IMPORTERS);
const SHELL_TRUE_PATTERN = /shell\s*:\s*true/;
const RUNTIME_SPAWN_PATTERN = /\bspawn\s*\(|\bfork\s*\(/;
const TEST_FILE_RE = /\.(test|spec)\.ts$|\.e2e\.test\.ts$/;
const ORCHESTRATION_FILE_LIMITS = [
  { file: "src/node-host/runner.ts", maxLines: 60 },
  { file: "src/infra/exec-approvals.ts", maxLines: 30 },
  { file: "src/agents/bash-tools.exec.ts", maxLines: 1000 },
];
const BOUNDARY_ONLY_FILES = [
  {
    file: "src/node-host/runner.ts",
    bannedImports: ["node:child_process", "child_process", "../process/spawn-utils.js"],
    bannedMarkers: ["spawn(", "fork("],
  },
  {
    file: "src/agents/bash-tools.exec.ts",
    bannedImports: ["node:child_process", "child_process"],
    bannedMarkers: ["DISALLOWED_PIPELINE_TOKENS", "globToRegExp(", "matchesPattern("],
  },
];
const BARREL_ONLY_FILES = ["src/infra/exec-approvals.ts"];

function walkRuntimeTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkRuntimeTsFiles(full));
    } else if (entry.isFile() && full.endsWith(".ts") && !TEST_FILE_RE.test(full)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Removes comments and string literal contents while preserving newlines so
 * heuristic security scans can match runtime code without comment/string
 * false positives.
 */
function stripComments(content: string): string {
  let result = "";
  let state: "code" | "line-comment" | "block-comment" | "single" | "double" | "template" = "code";
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index] ?? "";
    const next = content[index + 1] ?? "";

    if (state === "line-comment") {
      if (char === "\n") {
        state = "code";
        result += "\n";
      } else {
        result += " ";
      }
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        result += "  ";
        index += 1;
        state = "code";
      } else {
        result += char === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (state === "single" || state === "double" || state === "template") {
      const delimiter = state === "single" ? "'" : state === "double" ? '"' : "`";
      if (escaped) {
        escaped = false;
        result += char === "\n" ? "\n" : " ";
        continue;
      }
      if (char === "\\") {
        escaped = true;
        result += " ";
        continue;
      }
      if (char === delimiter) {
        state = "code";
        result += " ";
        continue;
      }
      result += char === "\n" ? "\n" : " ";
      continue;
    }

    if (char === "/" && next === "/") {
      state = "line-comment";
      result += "  ";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      state = "block-comment";
      result += "  ";
      index += 1;
      continue;
    }
    if (char === "'") {
      state = "single";
      result += " ";
      continue;
    }
    if (char === '"') {
      state = "double";
      result += " ";
      continue;
    }
    if (char === "`") {
      state = "template";
      result += " ";
      continue;
    }
    result += char;
  }

  return result;
}

// Authority-boundary enforcement intentionally covers the shipped Node/TS
// runtime roots in src/ and extensions/. Native apps under apps/ and package
// wrapper scripts under packages/ are reviewed elsewhere and stay outside this
// TypeScript-only child_process exception scan.
const scanRootPaths = AUTHORITY_BOUNDARY_SCAN_ROOTS.map((root) => path.resolve(root));
const authorityBoundaryFiles = scanRootPaths.flatMap((rootDir) =>
  existsSync(rootDir) ? walkRuntimeTsFiles(rootDir) : [],
);

if (authorityBoundaryFiles.length > 0) {
  for (const absPath of authorityBoundaryFiles) {
    const relPath = toAuthorityBoundaryRepoPath(absPath);
    let content: string;
    try {
      content = readFileSync(absPath, "utf8");
    } catch {
      continue;
    }

    // Flag direct child_process value imports (not type-only imports) outside the allowlist.
    const hasRealChildProcessImport = content
      .split("\n")
      .some(
        (line) =>
          /from\s+["'](?:node:)?child_process["']/.test(line) &&
          !/^\s*import\s+type\s+/.test(line),
      );
    if (hasRealChildProcessImport) {
      if (!ALLOWED_CHILD_PROCESS_IMPORTERS.has(relPath)) {
        console.error(
          `❌ ${relPath}: imports node:child_process directly – route runtime execution through src/security/subprocess.ts or update src/security/authority-boundaries.ts with reviewed justification`,
        );
        failed = true;
      }
    }
  }
  console.log(
    `✅ Child-process boundary scan complete (${AUTHORITY_BOUNDARY_SCAN_ROOTS.join(", ")})`,
  );
} else {
  console.warn("⚠️  no authority-boundary scan roots found; skipping child-process scan");
}

const srcDir = path.resolve("src");
if (existsSync(srcDir)) {
  for (const absPath of walkRuntimeTsFiles(srcDir)) {
    const relPath = toAuthorityBoundaryRepoPath(absPath);
    let content: string;
    try {
      content = readFileSync(absPath, "utf8");
    } catch {
      continue;
    }

    const stripped = stripComments(content);
    if (relPath.startsWith("src/runtime/")) {
      if (
        content
          .split("\n")
          .some(
            (line) =>
              /from\s+["'](?:node:)?child_process["']/.test(line) &&
              !/^\s*import\s+type\s+/.test(line),
          )
      ) {
        console.error(`❌ ${relPath}: runtime code must not import child_process authority`);
        failed = true;
      }
      if (RUNTIME_SPAWN_PATTERN.test(stripped)) {
        console.error(`❌ ${relPath}: runtime code must not contain raw spawn/fork calls`);
        failed = true;
      }
    }

    // Keep the historic shell:true heuristic scoped to src runtime code.
    if (SHELL_TRUE_PATTERN.test(stripped)) {
      console.error(`❌ ${relPath}: contains shell:true (never permitted in runtime code)`);
      failed = true;
    }
  }
}

for (const entry of BOUNDARY_ONLY_FILES) {
  if (!existsSync(entry.file)) {
    continue;
  }
  const content = readFileSync(entry.file, "utf8");
  for (const specifier of entry.bannedImports) {
    const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`from\\s+[\"']${escaped}[\"']`).test(content)) {
      console.error(`❌ ${entry.file}: imports disallowed low-level authority ${specifier}`);
      failed = true;
    }
  }
  const stripped = stripComments(content);
  for (const marker of entry.bannedMarkers) {
    if (stripped.includes(marker)) {
      console.error(`❌ ${entry.file}: contains disallowed orchestration marker ${marker}`);
      failed = true;
    }
  }
}

for (const file of BARREL_ONLY_FILES) {
  if (!existsSync(file)) {
    continue;
  }
  const content = readFileSync(file, "utf8");
  const meaningfulLines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!meaningfulLines.every((line) => line.startsWith('export * from "./exec-approvals/'))) {
    console.error(`❌ ${file}: compatibility file must remain a barrel only`);
    failed = true;
  }
}

for (const entry of ORCHESTRATION_FILE_LIMITS) {
  if (!existsSync(entry.file)) {
    continue;
  }
  const lineCount = readFileSync(entry.file, "utf8").split("\n").length;
  if (lineCount > entry.maxLines) {
    console.error(`❌ ${entry.file}: grew past ${entry.maxLines} lines (${lineCount})`);
    failed = true;
  }
}

if (failed) {
  console.error("\n❌ Security Integrity Check FAILED");
  process.exit(1);
}

console.log("\n✅ Security Integrity Check PASSED");
