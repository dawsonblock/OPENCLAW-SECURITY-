import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

function walkTypescriptFiles(rootDir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkTypescriptFiles(absolutePath, out);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.endsWith(".ts")) {
      continue;
    }
    if (entry.name.endsWith(".test.ts")) {
      continue;
    }
    out.push(absolutePath);
  }
  return out;
}

function toPosixRelativePath(absPath: string): string {
  return path.relative(process.cwd(), absPath).split(path.sep).join("/");
}

describe("rfsn runtime tool entrypoints", () => {
  test("runtime agent files use createGatedTools instead of direct wrapper calls", () => {
    const files = walkTypescriptFiles(path.resolve(process.cwd(), "src/agents"));
    const offenders: string[] = [];

    for (const file of files) {
      const relPath = toPosixRelativePath(file);
      const source = fs.readFileSync(file, "utf8");
      if (!source.includes("wrapToolsWithRfsnGate(")) {
        continue;
      }
      if (relPath === "src/agents/tools/index.gated.ts") {
        continue;
      }
      offenders.push(relPath);
    }

    expect(offenders).toEqual([]);
  });
});
