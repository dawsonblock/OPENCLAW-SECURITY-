import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolveWorkspaceRoot, validateExecCwd } from "./cwd-containment.js";

describe("cwd-containment", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cwd-contain-"));
    await fs.mkdir(path.join(tmpRoot, "workspace", "subdir"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  });

  const wsRoot = () => path.join(tmpRoot, "workspace");

  describe("validateExecCwd", () => {
    test("returns workspace root when cwd is undefined", async () => {
      const result = await validateExecCwd(undefined, wsRoot());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.resolvedCwd).toBe(await fs.realpath(wsRoot()));
      }
    });

    test("returns workspace root when cwd is empty string", async () => {
      const result = await validateExecCwd("", wsRoot());
      expect(result.ok).toBe(true);
    });

    test("allows subdirectory within workspace", async () => {
      const result = await validateExecCwd("subdir", wsRoot());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.resolvedCwd).toContain("subdir");
      }
    });

    test("rejects parent traversal via ../", async () => {
      const result = await validateExecCwd("../../", wsRoot());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("outside workspace root");
      }
    });

    test("rejects absolute path outside root", async () => {
      const result = await validateExecCwd("/tmp", wsRoot());
      expect(result.ok).toBe(false);
    });

    test("rejects nonexistent directory", async () => {
      const result = await validateExecCwd("does-not-exist", wsRoot());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("does not exist");
      }
    });

    test("rejects symlink escape", async () => {
      const outsideDir = path.join(tmpRoot, "outside");
      await fs.mkdir(outsideDir);
      const symlinkPath = path.join(wsRoot(), "sneaky");
      await fs.symlink(outsideDir, symlinkPath);
      const result = await validateExecCwd("sneaky", wsRoot());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("symlink");
      }
    });

    test("rejects file as cwd", async () => {
      const filePath = path.join(wsRoot(), "afile.txt");
      await fs.writeFile(filePath, "hi");
      const result = await validateExecCwd("afile.txt", wsRoot());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("not a directory");
      }
    });

    test("rejects when workspace root is empty", async () => {
      const result = await validateExecCwd("subdir", "");
      expect(result.ok).toBe(false);
    });

    test("rejects when workspace root does not exist", async () => {
      const result = await validateExecCwd("subdir", "/nonexistent/root/path");
      expect(result.ok).toBe(false);
    });
  });

  describe("resolveWorkspaceRoot", () => {
    test("prefers config over env", () => {
      expect(resolveWorkspaceRoot("/from/config", { OPENCLAW_WORKSPACE_ROOT: "/from/env" })).toBe(
        "/from/config",
      );
    });

    test("falls back to env", () => {
      expect(resolveWorkspaceRoot(undefined, { OPENCLAW_WORKSPACE_ROOT: "/from/env" })).toBe(
        "/from/env",
      );
    });

    test("returns undefined when neither", () => {
      expect(resolveWorkspaceRoot(undefined, {})).toBeUndefined();
    });
  });
});
