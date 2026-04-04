import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { matchAllowlist, resolveCommandResolution, type ExecAllowlistEntry } from "../exec-approvals.js";

function makePathEnv(binDir: string): NodeJS.ProcessEnv {
  if (process.platform !== "win32") {
    return { PATH: binDir };
  }
  return { PATH: binDir, PATHEXT: ".EXE;.CMD;.BAT;.COM" };
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-exec-approvals-"));
}

describe("exec approvals match", () => {
  it("ignores basename-only patterns", () => {
    const resolution = {
      rawExecutable: "rg",
      resolvedPath: "/opt/homebrew/bin/rg",
      executableName: "rg",
    };
    const entries: ExecAllowlistEntry[] = [{ pattern: "RG" }];
    expect(matchAllowlist(entries, resolution)).toBeNull();
  });

  it("matches by resolved path with double-star patterns", () => {
    const resolution = {
      rawExecutable: "rg",
      resolvedPath: "/opt/homebrew/bin/rg",
      executableName: "rg",
    };
    const entries: ExecAllowlistEntry[] = [{ pattern: "/opt/**/rg" }];
    expect(matchAllowlist(entries, resolution)?.pattern).toBe("/opt/**/rg");
  });

  it("does not let star cross path separators", () => {
    const resolution = {
      rawExecutable: "rg",
      resolvedPath: "/opt/homebrew/bin/rg",
      executableName: "rg",
    };
    const entries: ExecAllowlistEntry[] = [{ pattern: "/opt/*/rg" }];
    expect(matchAllowlist(entries, resolution)).toBeNull();
  });

  it("requires a resolved path", () => {
    const resolution = {
      rawExecutable: "bin/rg",
      resolvedPath: undefined,
      executableName: "rg",
    };
    const entries: ExecAllowlistEntry[] = [{ pattern: "bin/rg" }];
    expect(matchAllowlist(entries, resolution)).toBeNull();
  });

  it("resolves PATH executables", () => {
    const dir = makeTempDir();
    const binDir = path.join(dir, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const exeName = process.platform === "win32" ? "rg.exe" : "rg";
    const exe = path.join(binDir, exeName);
    fs.writeFileSync(exe, "");
    fs.chmodSync(exe, 0o755);
    const res = resolveCommandResolution("rg -n foo", undefined, makePathEnv(binDir));
    expect(res?.resolvedPath).toBe(exe);
    expect(res?.executableName).toBe(exeName);
  });

  it("resolves relative paths against cwd", () => {
    const dir = makeTempDir();
    const cwd = path.join(dir, "project");
    const script = path.join(cwd, "scripts", "run.sh");
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, "");
    fs.chmodSync(script, 0o755);
    const res = resolveCommandResolution("./scripts/run.sh --flag", cwd, undefined);
    expect(res?.resolvedPath).toBe(script);
  });

  it("parses quoted executables", () => {
    const dir = makeTempDir();
    const cwd = path.join(dir, "project");
    const script = path.join(cwd, "bin", "tool");
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, "");
    fs.chmodSync(script, 0o755);
    const res = resolveCommandResolution('"./bin/tool" --version', cwd, undefined);
    expect(res?.resolvedPath).toBe(script);
  });
});
