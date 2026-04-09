import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REVIEWED_AUTHORITY_IMPORTERS } from "./authority-boundaries.js";
import {
  collectRuntimeImportSpecifiers,
  findRuntimeImporters,
  scanAuthorityBoundaryImporters,
} from "./authority-boundary-importers.js";

describe("execution authority boundaries", () => {
  test("type-only named imports and exports do not count as runtime importers", () => {
    const specifiers = collectRuntimeImportSpecifiers(`
      import "../process/spawn-utils.js";
      import { type ExecProcessHandle } from "../agents/bash-tools.exec.types.js";
      import { runtimeValue, type Helper } from "../process/exec.js";
      export { type SpawnFallback } from "../process/spawn-utils.js";
      export { resolveCommandStdio, type SpawnWithFallbackResult } from "../process/spawn-utils.js";
    `);

    expect(specifiers).toEqual(["../process/spawn-utils.js", "../process/exec.js"]);
  });

  test("tsconfig path aliases still count as runtime importers of reviewed authority files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-authority-boundaries-"));

    try {
      const target = path.join(tempRoot, "src/process/spawn-utils.ts");
      const importer = path.join(tempRoot, "src/agents/alias-importer.ts");

      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.mkdir(path.dirname(importer), { recursive: true });
      await fs.writeFile(
        path.join(tempRoot, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            paths: {
              "*": ["./*"],
            },
          },
        }),
      );
      await fs.writeFile(target, "export function spawnWithFallback() { return 1; }\n");
      await fs.writeFile(
        importer,
        'export { spawnWithFallback } from "src/process/spawn-utils.js";\n',
      );

      const importers = await findRuntimeImporters(
        "src/process/spawn-utils.ts",
        [target, importer],
        {
          cwd: tempRoot,
        },
      );

      expect(importers).toEqual(["src/agents/alias-importer.ts"]);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
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
    const { forbiddenImporters } = await scanAuthorityBoundaryImporters();

    expect(forbiddenImporters).toEqual([]);
  });
});
