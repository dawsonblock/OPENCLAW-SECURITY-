import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeShellCommand,
  evaluateExecAllowlist,
  isSafeBinUsage,
  normalizeSafeBins,
} from "../exec-approvals.js";

describe("exec approvals evaluate", () => {
  it("allows safe bins with non-path args", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-exec-approvals-"));
    const binDir = path.join(dir, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const exeName = process.platform === "win32" ? "jq.exe" : "jq";
    const exe = path.join(binDir, exeName);
    fs.writeFileSync(exe, "");
    fs.chmodSync(exe, 0o755);
    const env = process.platform === "win32" ? { PATH: binDir, PATHEXT: ".EXE;.CMD;.BAT;.COM" } : { PATH: binDir };
    const res = analyzeShellCommand({ command: "jq .foo", cwd: dir, env });
    expect(res.ok).toBe(true);
    const segment = res.segments[0];
    const ok = isSafeBinUsage({
      argv: segment.argv,
      resolution: segment.resolution,
      safeBins: normalizeSafeBins(["jq"]),
      cwd: dir,
    });
    expect(ok).toBe(true);
  });

  it("blocks safe bins with file args", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-exec-approvals-"));
    const binDir = path.join(dir, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const exeName = process.platform === "win32" ? "jq.exe" : "jq";
    const exe = path.join(binDir, exeName);
    fs.writeFileSync(exe, "");
    fs.chmodSync(exe, 0o755);
    const file = path.join(dir, "secret.json");
    fs.writeFileSync(file, "{}");
    const env = process.platform === "win32" ? { PATH: binDir, PATHEXT: ".EXE;.CMD;.BAT;.COM" } : { PATH: binDir };
    const res = analyzeShellCommand({ command: "jq .foo secret.json", cwd: dir, env });
    expect(res.ok).toBe(true);
    const segment = res.segments[0];
    const ok = isSafeBinUsage({
      argv: segment.argv,
      resolution: segment.resolution,
      safeBins: normalizeSafeBins(["jq"]),
      cwd: dir,
    });
    expect(ok).toBe(false);
  });

  it("satisfies allowlist on exact match", () => {
    const analysis = {
      ok: true,
      segments: [
        {
          raw: "tool",
          argv: ["tool"],
          resolution: {
            rawExecutable: "tool",
            resolvedPath: "/usr/bin/tool",
            executableName: "tool",
          },
        },
      ],
    };
    const result = evaluateExecAllowlist({
      analysis,
      allowlist: [{ pattern: "/usr/bin/tool" }],
      safeBins: new Set(),
      cwd: "/tmp",
    });
    expect(result.allowlistSatisfied).toBe(true);
    expect(result.allowlistMatches.map((entry) => entry.pattern)).toEqual(["/usr/bin/tool"]);
  });

  it("satisfies allowlist via safe bins", () => {
    const analysis = {
      ok: true,
      segments: [
        {
          raw: "jq .foo",
          argv: ["jq", ".foo"],
          resolution: {
            rawExecutable: "jq",
            resolvedPath: "/usr/bin/jq",
            executableName: "jq",
          },
        },
      ],
    };
    const result = evaluateExecAllowlist({
      analysis,
      allowlist: [],
      safeBins: normalizeSafeBins(["jq"]),
      cwd: "/tmp",
    });
    expect(result.allowlistSatisfied).toBe(true);
    expect(result.allowlistMatches).toEqual([]);
  });

  it("satisfies allowlist via auto-allow skills", () => {
    const analysis = {
      ok: true,
      segments: [
        {
          raw: "skill-bin",
          argv: ["skill-bin", "--help"],
          resolution: {
            rawExecutable: "skill-bin",
            resolvedPath: "/opt/skills/skill-bin",
            executableName: "skill-bin",
          },
        },
      ],
    };
    const result = evaluateExecAllowlist({
      analysis,
      allowlist: [],
      safeBins: new Set(),
      skillBins: new Set(["skill-bin"]),
      autoAllowSkills: true,
      cwd: "/tmp",
    });
    expect(result.allowlistSatisfied).toBe(true);
  });
});
