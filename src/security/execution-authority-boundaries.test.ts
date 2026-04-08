import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

const SRC_ROOT = path.resolve(process.cwd(), "src");
const RUNTIME_TS_FILE_RE = /\.ts$/;
const TEST_FILE_RE = /\.(test|spec)\.ts$|\.e2e\.test\.ts$/;

const REVIEWED_EXEC_SESSION_IMPORTERS = [
  "src/agents/bash-tools.exec.runtime.ts",
  "src/process/exec.ts",
];
const REVIEWED_LOCAL_SHELL_IMPORTERS = ["src/tui/tui.ts"];
const FORBIDDEN_AUTHORITY_IMPORT_ROOTS = [
  "src/gateway/",
  "src/node-host/",
  "src/rfsn/",
  "src/agents/tools/",
];

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
      if (!RUNTIME_TS_FILE_RE.test(entry.name) || TEST_FILE_RE.test(entry.name)) {
        continue;
      }
      files.push(absPath);
    }
  }

  return files;
}

function collectRuntimeImportSpecifiers(content: string): string[] {
  const specifiers = new Set<string>();
  const sourceFile = ts.createSourceFile(
    "execution-authority-boundaries.test.ts",
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      !statement.importClause?.isTypeOnly &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const specifier = statement.moduleSpecifier.text;
      if (specifier.startsWith(".")) {
        specifiers.add(specifier);
      }
      continue;
    }

    if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const specifier = statement.moduleSpecifier.text;
      if (specifier.startsWith(".")) {
        specifiers.add(specifier);
      }
    }
  }

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0
    ) {
      const [firstArg] = node.arguments;
      if (ts.isStringLiteral(firstArg) && firstArg.text.startsWith(".")) {
        specifiers.add(firstArg.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return [...specifiers];
}

// Path-only structural resolution is deliberate here: this test guards the
// repo's current relative .ts/.js runtime imports without reimplementing the
// full TypeScript or Node module resolver.
function resolveImportCandidates(importerAbsPath: string, specifier: string): string[] {
  const base = path.resolve(path.dirname(importerAbsPath), specifier);
  const ext = path.extname(base);
  const candidates = new Set<string>([path.normalize(base)]);

  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
    candidates.add(path.normalize(base.slice(0, -ext.length) + ".ts"));
  }
  if (ext === ".jsx" || ext === ".tsx") {
    candidates.add(path.normalize(base.slice(0, -ext.length) + ".tsx"));
  }
  if (!ext) {
    candidates.add(path.normalize(`${base}.ts`));
    candidates.add(path.normalize(`${base}.tsx`));
    candidates.add(path.normalize(path.join(base, "index.ts")));
    candidates.add(path.normalize(path.join(base, "index.tsx")));
  }

  return [...candidates];
}

async function findRuntimeImporters(targetRelPath: string): Promise<string[]> {
  const targetAbsPath = path.normalize(path.resolve(process.cwd(), targetRelPath));
  const files = await listRuntimeTsFiles(SRC_ROOT);
  const importers: string[] = [];

  for (const absPath of files) {
    if (path.normalize(absPath) === targetAbsPath) {
      continue;
    }
    const content = await fs.readFile(absPath, "utf8");
    const importsTarget = collectRuntimeImportSpecifiers(content).some((specifier) =>
      resolveImportCandidates(absPath, specifier).includes(targetAbsPath),
    );
    if (importsTarget) {
      importers.push(toPosixRelative(absPath));
    }
  }

  return importers.toSorted();
}

describe("execution authority boundaries", () => {
  test("spawn-utils stays limited to the reviewed exec-session runtime path", async () => {
    const importers = await findRuntimeImporters("src/process/spawn-utils.ts");

    expect(importers).toEqual(REVIEWED_EXEC_SESSION_IMPORTERS);
    expect(importers.some((relPath) => relPath.startsWith("src/gateway/"))).toBe(false);
    expect(importers.some((relPath) => relPath.startsWith("src/node-host/"))).toBe(false);
    expect(importers.some((relPath) => relPath.startsWith("src/rfsn/"))).toBe(false);
    expect(importers).not.toContain("src/agents/tools/nodes-tool.ts");
  });

  test("tui-local-shell stays reachable only from the TUI surface", async () => {
    const importers = await findRuntimeImporters("src/tui/tui-local-shell.ts");

    expect(importers).toEqual(REVIEWED_LOCAL_SHELL_IMPORTERS);
  });

  test("entry stays bootstrap-only and outside runtime imports", async () => {
    const importers = await findRuntimeImporters("src/entry.ts");

    expect(importers).toEqual([]);
  });

  test("gateway, node-host, RFSN, and generic tool paths do not directly import execution exceptions", async () => {
    const targets = [
      "src/process/spawn-utils.ts",
      "src/tui/tui-local-shell.ts",
      "src/entry.ts",
    ] as const;
    const forbiddenImporters: string[] = [];

    for (const target of targets) {
      const importers = await findRuntimeImporters(target);
      for (const importer of importers) {
        if (FORBIDDEN_AUTHORITY_IMPORT_ROOTS.some((root) => importer.startsWith(root))) {
          forbiddenImporters.push(`${importer} -> ${target}`);
        }
      }
    }

    expect(forbiddenImporters).toEqual([]);
  });
});
