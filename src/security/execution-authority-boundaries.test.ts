import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import {
  AUTHORITY_BOUNDARY_SCAN_ROOTS,
  AUTHORITY_EXCEPTION_TARGETS,
  FORBIDDEN_AUTHORITY_IMPORT_ROOTS,
  REVIEWED_AUTHORITY_IMPORTERS,
  toAuthorityBoundaryRepoPath,
} from "./authority-boundaries.js";

const RUNTIME_TS_FILE_RE = /^(?!.*\.d\.ts$).*\.ts$/;
const TEST_FILE_RE = /\.(test|spec)\.ts$|\.e2e\.test\.ts$/;
const AUTHORITY_SCAN_ROOT_PATHS = AUTHORITY_BOUNDARY_SCAN_ROOTS.map((root) =>
  path.resolve(process.cwd(), root),
);

async function listRuntimeTsFiles(rootDirs: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  const stack = [...rootDirs];

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

  const hasRuntimeImportBinding = (importClause: ts.ImportClause | undefined): boolean => {
    if (!importClause || importClause.isTypeOnly) {
      return false;
    }
    if (importClause.name) {
      return true;
    }
    if (!importClause.namedBindings) {
      return false;
    }
    if (ts.isNamespaceImport(importClause.namedBindings)) {
      return true;
    }
    return importClause.namedBindings.elements.some((element) => !element.isTypeOnly);
  };

  const hasRuntimeExportBinding = (statement: ts.ExportDeclaration): boolean => {
    if (statement.isTypeOnly) {
      return false;
    }
    if (!statement.exportClause) {
      return true;
    }
    if (ts.isNamespaceExport(statement.exportClause)) {
      return true;
    }
    return statement.exportClause.elements.some((element) => !element.isTypeOnly);
  };

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      hasRuntimeImportBinding(statement.importClause) &&
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
      hasRuntimeExportBinding(statement) &&
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
  const files = await listRuntimeTsFiles(AUTHORITY_SCAN_ROOT_PATHS);
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
      importers.push(toAuthorityBoundaryRepoPath(absPath));
    }
  }

  return importers.toSorted();
}

// This structural proof intentionally covers the shipped Node/TypeScript runtime
// roots in src/ and extensions/. Native apps and package wrapper scripts stay
// outside this path-only import scan.
describe("execution authority boundaries", () => {
  test("type-only named imports and exports do not count as runtime importers", () => {
    const specifiers = collectRuntimeImportSpecifiers(`
      import { type ExecProcessHandle } from "../agents/bash-tools.exec.types.js";
      import { runtimeValue, type Helper } from "../process/exec.js";
      export { type SpawnFallback } from "../process/spawn-utils.js";
      export { resolveCommandStdio, type SpawnWithFallbackResult } from "../process/spawn-utils.js";
    `);

    expect(specifiers).toEqual(["../process/exec.js", "../process/spawn-utils.js"]);
  });

  test("spawn-utils stays limited to the reviewed exec-session runtime path", async () => {
    const importers = await findRuntimeImporters("src/process/spawn-utils.ts");

    expect(importers).toEqual([...REVIEWED_AUTHORITY_IMPORTERS["src/process/spawn-utils.ts"]]);
    expect(importers.some((relPath) => relPath.startsWith("src/gateway/"))).toBe(false);
    expect(importers.some((relPath) => relPath.startsWith("src/node-host/"))).toBe(false);
    expect(importers.some((relPath) => relPath.startsWith("src/rfsn/"))).toBe(false);
    expect(importers).not.toContain("src/agents/tools/nodes-tool.ts");
  });

  test("tui-local-shell stays reachable only from the TUI surface", async () => {
    const importers = await findRuntimeImporters("src/tui/tui-local-shell.ts");

    expect(importers).toEqual([...REVIEWED_AUTHORITY_IMPORTERS["src/tui/tui-local-shell.ts"]]);
  });

  test("entry stays bootstrap-only and outside runtime imports", async () => {
    const importers = await findRuntimeImporters("src/entry.ts");

    expect(importers).toEqual([...REVIEWED_AUTHORITY_IMPORTERS["src/entry.ts"]]);
  });

  test("gateway, node-host, RFSN, and generic tool paths do not directly import execution exceptions", async () => {
    const forbiddenImporters: string[] = [];

    for (const target of AUTHORITY_EXCEPTION_TARGETS) {
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
