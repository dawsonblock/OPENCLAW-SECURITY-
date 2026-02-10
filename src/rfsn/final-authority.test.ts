import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const SRC_ROOT = path.resolve(process.cwd(), "src");

const ALLOWED_TOOL_EXECUTE_FILES = new Set([
  "src/rfsn/dispatch.ts",
  "src/agents/pi-tool-definition-adapter.ts",
  "src/agents/pi-tools.read.ts",
]);

const ALLOWED_NODE_INVOKE_FILES = new Set(["src/gateway/node-command-kernel-gate.ts"]);

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
    }

    expect(violations).toEqual([]);
  });
});
