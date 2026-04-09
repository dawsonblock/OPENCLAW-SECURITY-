import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildScrubbedEnv, runAllowedCommand, spawnAllowed } from "./subprocess.js";

describe("subprocess security helpers", () => {
  test("buildScrubbedEnv keeps only allowed env keys and strips blocked vars", () => {
    const prevPath = process.env.PATH;
    const prevHome = process.env.HOME;
    const prevNodeOptions = process.env.NODE_OPTIONS;
    try {
      process.env.PATH = "/usr/bin";
      process.env.HOME = "/tmp/home";
      process.env.NODE_OPTIONS = "--inspect";

      const env = buildScrubbedEnv({
        inheritEnv: true,
        allowEnv: ["PATH", "HOME", "NODE_OPTIONS"],
      });

      expect(env.PATH).toBe("/usr/bin");
      expect(env.HOME).toBe("/tmp/home");
      expect(env.NODE_OPTIONS).toBeUndefined();
    } finally {
      if (typeof prevPath === "string") {
        process.env.PATH = prevPath;
      } else {
        delete process.env.PATH;
      }
      if (typeof prevHome === "string") {
        process.env.HOME = prevHome;
      } else {
        delete process.env.HOME;
      }
      if (typeof prevNodeOptions === "string") {
        process.env.NODE_OPTIONS = prevNodeOptions;
      } else {
        delete process.env.NODE_OPTIONS;
      }
    }
  });

  test("spawnAllowed rejects executable paths by default", () => {
    expect(() =>
      spawnAllowed({
        command: path.resolve("/tmp/not-allowed-binary"),
        args: [],
        allowedBins: ["not-allowed-binary"],
      }),
    ).toThrow(/Blocked executable path/);

    expect(() =>
      spawnAllowed({
        command: "./not-allowed-binary",
        args: [],
        allowedBins: ["not-allowed-binary"],
      }),
    ).toThrow(/Blocked executable path/);
  });

  test("runAllowedCommand executes allowlisted commands", async () => {
    const result = await runAllowedCommand({
      command: process.execPath,
      args: ["-e", "process.stdout.write('ok')"],
      allowedBins: ["node"],
      allowAbsolutePath: true,
      timeoutMs: 5_000,
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("ok");
  });

  test("runAllowedCommand enforces output caps", async () => {
    await expect(
      runAllowedCommand({
        command: process.execPath,
        args: ["-e", "process.stdout.write('x'.repeat(5000))"],
        allowedBins: ["node"],
        allowAbsolutePath: true,
        timeoutMs: 5_000,
        maxStdoutBytes: 1_024,
      }),
    ).rejects.toThrow(/stdout exceeded/);
  });
});
