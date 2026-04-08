import { describe, expect, test } from "vitest";
import {
  REVIEWED_AUTHORITY_IMPORTERS,
} from "./authority-boundaries.js";
import {
  collectRuntimeImportSpecifiers,
  findRuntimeImporters,
  scanAuthorityBoundaryImporters,
} from "./authority-boundary-importers.js";

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
    const { forbiddenImporters } = await scanAuthorityBoundaryImporters();

    expect(forbiddenImporters).toEqual([]);
  });
});
