import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

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

// 3. Child-process boundary scan
// Scan all non-test runtime TypeScript files under src/ and flag any that
// import node:child_process directly outside the approved exception list.
//
// Approved exceptions (must be kept in sync with ALLOWED_CHILD_PROCESS_IMPORTERS
// in src/rfsn/final-authority.test.ts):
//   - src/security/subprocess.ts   – the low-level spawn authority
//   - src/process/spawn-utils.ts   – internal seam helper (type+spawn)
//   - src/entry.ts                 – bootstrap-only self-respawn
//   - src/tui/tui-local-shell.ts   – explicit local-shell exception (opt-in only)
//   - src/runtime/supervisor.ts    – quarantined dead code (bare 'child_process')
const ALLOWED_CHILD_PROCESS_IMPORTERS = new Set([
  "src/security/subprocess.ts",
  "src/process/spawn-utils.ts",
  "src/entry.ts",
  "src/tui/tui-local-shell.ts",
  // supervisor.ts uses bare 'child_process' (not 'node:child_process'), so it
  // does not match the import pattern below. It is listed here for documentation.
  "src/runtime/supervisor.ts",
]);

const SHELL_TRUE_PATTERN = /shell\s*:\s*true/;
const TEST_FILE_RE = /\.(test|spec)\.ts$|\.e2e\.test\.ts$/;

function walkSrc(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkSrc(full));
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

const srcDir = "src";
if (existsSync(srcDir)) {
  for (const absPath of walkSrc(srcDir)) {
    const relPath = path.relative(".", absPath).split(path.sep).join("/");
    let content: string;
    try {
      content = readFileSync(absPath, "utf8");
    } catch {
      continue;
    }

    // Flag direct node:child_process value imports (not type-only imports) outside the allowlist.
    const hasRealChildProcessImport = content
      .split("\n")
      .some(
        (line) =>
          /from\s+["']node:child_process["']/.test(line) && !/^\s*import\s+type\s+/.test(line),
      );
    if (hasRealChildProcessImport) {
      if (!ALLOWED_CHILD_PROCESS_IMPORTERS.has(relPath)) {
        console.error(
          `❌ ${relPath}: imports node:child_process directly – route through src/process/exec.ts or add to exception list with justification`,
        );
        failed = true;
      }
    }

    // Flag shell:true (never allowed in runtime code).
    if (SHELL_TRUE_PATTERN.test(stripComments(content))) {
      console.error(`❌ ${relPath}: contains shell:true (never permitted in runtime code)`);
      failed = true;
    }
  }
  console.log("✅ Child-process boundary scan complete");
} else {
  console.warn("⚠️  src/ directory not found; skipping child-process scan");
}

if (failed) {
  console.error("\n❌ Security Integrity Check FAILED");
  process.exit(1);
}

console.log("\n✅ Security Integrity Check PASSED");
