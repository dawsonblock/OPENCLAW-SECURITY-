import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeArgvCommand,
  analyzeShellCommand,
  evaluateShellAllowlist,
  type ExecAllowlistEntry,
} from "../exec-approvals.js";

function makePathEnv(binDir: string): NodeJS.ProcessEnv {
  if (process.platform !== "win32") {
    return { PATH: binDir };
  }
  return { PATH: binDir, PATHEXT: ".EXE;.CMD;.BAT;.COM" };
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-exec-approvals-"));
}

describe("exec approvals parse", () => {
  it("parses simple pipelines", () => {
    const res = analyzeShellCommand({ command: "echo ok | jq .foo" });
    expect(res.ok).toBe(true);
    expect(res.segments.map((seg) => seg.argv[0])).toEqual(["echo", "jq"]);
  });

  it("parses chained commands", () => {
    const res = analyzeShellCommand({ command: "ls && rm -rf /" });
    expect(res.ok).toBe(true);
    expect(res.chains?.map((chain) => chain[0]?.argv[0])).toEqual(["ls", "rm"]);
  });

  it("parses argv commands", () => {
    const res = analyzeArgvCommand({ argv: ["/bin/echo", "ok"] });
    expect(res.ok).toBe(true);
    expect(res.segments[0]?.argv).toEqual(["/bin/echo", "ok"]);
  });

  it("rejects command substitution inside double quotes", () => {
    const res = analyzeShellCommand({ command: 'echo "output: $(whoami)"' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("unsupported shell token: $()");
  });

  it("rejects backticks inside double quotes", () => {
    const res = analyzeShellCommand({ command: 'echo "output: `id`"' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("unsupported shell token: `");
  });

  it("allows escaped command substitution inside double quotes", () => {
    const res = analyzeShellCommand({ command: 'echo "output: \\$(whoami)"' });
    expect(res.ok).toBe(true);
    expect(res.segments[0]?.argv[0]).toBe("echo");
  });

  it("allows command substitution syntax inside single quotes", () => {
    const res = analyzeShellCommand({ command: "echo 'output: $(whoami)'" });
    expect(res.ok).toBe(true);
    expect(res.segments[0]?.argv[0]).toBe("echo");
  });

  it("rejects windows shell metacharacters", () => {
    const res = analyzeShellCommand({
      command: "ping 127.0.0.1 -n 1 & whoami",
      platform: "win32",
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("unsupported windows shell token: &");
  });

  it("parses windows quoted executables", () => {
    const res = analyzeShellCommand({
      command: '"C:\\Program Files\\Tool\\tool.exe" --version',
      platform: "win32",
    });
    expect(res.ok).toBe(true);
    expect(res.segments[0]?.argv).toEqual(["C:\\Program Files\\Tool\\tool.exe", "--version"]);
  });

  it("allows chained commands when all parts are allowlisted", () => {
    const allowlist: ExecAllowlistEntry[] = [
      { pattern: "/usr/bin/obsidian-cli" },
      { pattern: "/usr/bin/head" },
    ];
    const result = evaluateShellAllowlist({
      command:
        "/usr/bin/obsidian-cli print-default && /usr/bin/obsidian-cli search foo | /usr/bin/head",
      allowlist,
      safeBins: new Set(),
      cwd: "/tmp",
    });
    expect(result.analysisOk).toBe(true);
    expect(result.allowlistSatisfied).toBe(true);
  });

  it("rejects chained commands when any part is not allowlisted", () => {
    const allowlist: ExecAllowlistEntry[] = [{ pattern: "/usr/bin/obsidian-cli" }];
    const result = evaluateShellAllowlist({
      command: "/usr/bin/obsidian-cli print-default && /usr/bin/rm -rf /",
      allowlist,
      safeBins: new Set(),
      cwd: "/tmp",
    });
    expect(result.analysisOk).toBe(true);
    expect(result.allowlistSatisfied).toBe(false);
  });

  it("returns analysisOk false for malformed chains", () => {
    const allowlist: ExecAllowlistEntry[] = [{ pattern: "/usr/bin/echo" }];
    const result = evaluateShellAllowlist({
      command: "/usr/bin/echo ok &&",
      allowlist,
      safeBins: new Set(),
      cwd: "/tmp",
    });
    expect(result.analysisOk).toBe(false);
    expect(result.allowlistSatisfied).toBe(false);
  });

  it("respects quotes when splitting chains", () => {
    const allowlist: ExecAllowlistEntry[] = [{ pattern: "/usr/bin/echo" }];
    const result = evaluateShellAllowlist({
      command: '/usr/bin/echo "foo && bar"',
      allowlist,
      safeBins: new Set(),
      cwd: "/tmp",
    });
    expect(result.analysisOk).toBe(true);
    expect(result.allowlistSatisfied).toBe(true);
  });

  it("respects escaped quotes when splitting chains", () => {
    const allowlist: ExecAllowlistEntry[] = [{ pattern: "/usr/bin/echo" }];
    const result = evaluateShellAllowlist({
      command: '/usr/bin/echo "foo\\" && bar"',
      allowlist,
      safeBins: new Set(),
      cwd: "/tmp",
    });
    expect(result.analysisOk).toBe(true);
    expect(result.allowlistSatisfied).toBe(true);
  });

  it("rejects windows chain separators for allowlist analysis", () => {
    const dir = makeTempDir();
    const binDir = path.join(dir, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const exeName = process.platform === "win32" ? "ping.exe" : "ping";
    const exe = path.join(binDir, exeName);
    fs.writeFileSync(exe, "");
    fs.chmodSync(exe, 0o755);
    const allowlist: ExecAllowlistEntry[] = [{ pattern: "/usr/bin/ping" }];
    const result = evaluateShellAllowlist({
      command: "ping 127.0.0.1 -n 1 & whoami",
      allowlist,
      safeBins: new Set(),
      cwd: "/tmp",
      env: makePathEnv(binDir),
      platform: "win32",
    });
    expect(result.analysisOk).toBe(false);
    expect(result.allowlistSatisfied).toBe(false);
  });
});
