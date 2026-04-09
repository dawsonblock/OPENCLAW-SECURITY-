import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import {
  AUTHORITY_BOUNDARY_SCAN_ROOTS,
  AUTHORITY_EXCEPTION_TARGETS,
  FORBIDDEN_AUTHORITY_IMPORT_ROOTS,
  REVIEWED_AUTHORITY_IMPORTERS,
  toAuthorityBoundaryRepoPath,
} from "./authority-boundaries.js";

const RUNTIME_TS_FILE_RE = /^(?!.*\.d\.ts$).*\.ts$/;
const TEST_FILE_RE = /\.(test|spec)\.ts$|\.e2e\.test\.ts$/;

export type AuthorityExceptionTarget = (typeof AUTHORITY_EXCEPTION_TARGETS)[number];

export type AuthorityBoundaryImporterScanResult = {
  importersByTarget: Record<AuthorityExceptionTarget, string[]>;
  unexpectedImporters: string[];
  forbiddenImporters: string[];
};

const AUTHORITY_SCAN_ROOT_PATHS = AUTHORITY_BOUNDARY_SCAN_ROOTS.map((root) =>
  path.resolve(process.cwd(), root),
);

type AuthorityBoundaryResolverContext = {
  compilerOptions: ts.CompilerOptions;
  moduleResolutionHost: ts.ModuleResolutionHost;
};

function createAuthorityBoundaryResolverContext(
  cwd = process.cwd(),
): AuthorityBoundaryResolverContext {
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
  let compilerOptions: ts.CompilerOptions = {};

  if (configPath) {
    const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
    if (!readResult.error) {
      const parsed = ts.parseJsonConfigFileContent(
        readResult.config,
        ts.sys,
        path.dirname(configPath),
      );
      compilerOptions = parsed.options;
    }
  }

  return {
    compilerOptions,
    moduleResolutionHost: ts.sys,
  };
}

export async function listRuntimeTsFiles(
  scanRootPaths = AUTHORITY_SCAN_ROOT_PATHS,
): Promise<string[]> {
  const files: string[] = [];
  const stack = [...scanRootPaths];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        continue;
      }
      throw error;
    }
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

export function collectRuntimeImportSpecifiers(
  content: string,
  sourceFileName = "authority-boundary-importers.ts",
): string[] {
  const specifiers = new Set<string>();
  const sourceFile = ts.createSourceFile(
    sourceFileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const hasRuntimeImportBinding = (importClause: ts.ImportClause | undefined): boolean => {
    if (!importClause) {
      // `import './module.js';` is still a runtime dependency edge even though
      // it binds no local names, so it must count in the authority importer
      // scan.
      return true;
    }
    if (importClause.isTypeOnly) {
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
      specifiers.add(statement.moduleSpecifier.text);
      continue;
    }

    if (
      ts.isExportDeclaration(statement) &&
      hasRuntimeExportBinding(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      specifiers.add(statement.moduleSpecifier.text);
    }
  }

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0
    ) {
      const [firstArg] = node.arguments;
      if (ts.isStringLiteral(firstArg)) {
        specifiers.add(firstArg.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return [...specifiers];
}

function resolveRelativeImportCandidates(importerAbsPath: string, specifier: string): string[] {
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

function resolveConfiguredImportCandidate(
  importerAbsPath: string,
  specifier: string,
  context: AuthorityBoundaryResolverContext,
): string[] {
  const resolved = ts.resolveModuleName(
    specifier,
    importerAbsPath,
    context.compilerOptions,
    context.moduleResolutionHost,
  ).resolvedModule;

  if (!resolved || resolved.isExternalLibraryImport) {
    return [];
  }
  if (
    resolved.extension === ts.Extension.Dts ||
    resolved.extension === ts.Extension.Dcts ||
    resolved.extension === ts.Extension.Dmts
  ) {
    return [];
  }

  return [path.normalize(resolved.resolvedFileName)];
}

/**
 * The importer scan resolves normal relative runtime edges plus the configured
 * TypeScript path aliases from the nearest tsconfig.json that TypeScript finds
 * for the scan cwd. That keeps the authority proof aligned with the current
 * repo without growing into a general package-manager/module resolver or a
 * multi-project config crawler.
 */
function resolveImportCandidates(
  importerAbsPath: string,
  specifier: string,
  context: AuthorityBoundaryResolverContext,
): string[] {
  if (specifier.startsWith(".")) {
    return resolveRelativeImportCandidates(importerAbsPath, specifier);
  }

  return resolveConfiguredImportCandidate(importerAbsPath, specifier, context);
}

function areArraysEqual(array1: readonly string[], array2: readonly string[]): boolean {
  return array1.length === array2.length && array1.every((entry, index) => entry === array2[index]);
}

export async function findRuntimeImporters(
  targetRelPath: AuthorityExceptionTarget,
  files?: readonly string[],
  options?: {
    cwd?: string;
  },
): Promise<string[]> {
  const cwd = options?.cwd ?? process.cwd();
  const resolverContext = createAuthorityBoundaryResolverContext(cwd);
  const targetAbsPath = path.normalize(path.resolve(cwd, targetRelPath));
  const runtimeFiles = files ? [...files] : await listRuntimeTsFiles();
  const importers: string[] = [];

  for (const absPath of runtimeFiles) {
    if (path.normalize(absPath) === targetAbsPath) {
      continue;
    }
    const content = await fs.readFile(absPath, "utf8");
    const importsTarget = collectRuntimeImportSpecifiers(content, absPath).some((specifier) =>
      resolveImportCandidates(absPath, specifier, resolverContext).includes(targetAbsPath),
    );
    if (importsTarget) {
      importers.push(toAuthorityBoundaryRepoPath(absPath, cwd));
    }
  }

  return importers.toSorted();
}

export async function scanAuthorityBoundaryImporters(): Promise<AuthorityBoundaryImporterScanResult> {
  const runtimeFiles = await listRuntimeTsFiles();
  const importersByTarget = {} as Record<AuthorityExceptionTarget, string[]>;
  const unexpectedImporters: string[] = [];
  const forbiddenImporters: string[] = [];

  for (const target of AUTHORITY_EXCEPTION_TARGETS) {
    const importers = await findRuntimeImporters(target, runtimeFiles);
    const sortedImporters = [...importers].toSorted();
    importersByTarget[target] = sortedImporters;

    const reviewedImporters = [...REVIEWED_AUTHORITY_IMPORTERS[target]].toSorted();
    if (!areArraysEqual(sortedImporters, reviewedImporters)) {
      unexpectedImporters.push(
        `${target}: expected [${reviewedImporters.join(", ")}] but found [${sortedImporters.join(", ")}]`,
      );
    }

    for (const importer of sortedImporters) {
      if (FORBIDDEN_AUTHORITY_IMPORT_ROOTS.some((root) => importer.startsWith(root))) {
        forbiddenImporters.push(`${importer} -> ${target}`);
      }
    }
  }

  return {
    importersByTarget,
    unexpectedImporters: unexpectedImporters.toSorted(),
    forbiddenImporters: forbiddenImporters.toSorted(),
  };
}
