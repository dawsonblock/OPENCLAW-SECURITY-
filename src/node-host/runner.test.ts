import path from "node:path";
import { describe, expect, test } from "vitest";
import { spawnAllowed, runAllowedCommand } from "../security/subprocess.js";
import { buildNodeInvokeResultParams, sanitizeEnv } from "./runner.js";

describe("buildNodeInvokeResultParams", () => {
  test("omits optional fields when null/undefined", () => {
    const params = buildNodeInvokeResultParams(
      { id: "invoke-1", nodeId: "node-1", command: "system.run" },
      { ok: true, payloadJSON: null, error: null },
    );

    expect(params).toEqual({ id: "invoke-1", nodeId: "node-1", ok: true });
    expect("payloadJSON" in params).toBe(false);
    expect("error" in params).toBe(false);
  });

  test("includes payloadJSON when provided", () => {
    const params = buildNodeInvokeResultParams(
      { id: "invoke-2", nodeId: "node-2", command: "system.run" },
      { ok: true, payloadJSON: '{"ok":true}' },
    );

    expect(params.payloadJSON).toBe('{"ok":true}');
  });

  test("includes payload when provided", () => {
    const params = buildNodeInvokeResultParams(
      { id: "invoke-3", nodeId: "node-3", command: "system.run" },
      { ok: false, payload: { reason: "bad" } },
    );

    expect(params.payload).toEqual({ reason: "bad" });
  });
});

// Verify the execution seam properties that runCommand() relies on.
// runCommand() calls spawnAllowed with allowAbsolutePath: true and a
// pre-scrubbed env dict, so these tests prove the seam behaves correctly.
describe("runner execution seam (spawnAllowed via subprocess)", () => {
  test("rejects relative command path even if name is in allowedBins", () => {
    expect(() =>
      spawnAllowed({
        command: "./relative/node",
        args: [],
        allowedBins: ["node"],
        allowAbsolutePath: false,
      }),
    ).toThrow(/Blocked executable path/);
  });

  test("rejects absolute path when allowAbsolutePath is false", () => {
    expect(() =>
      spawnAllowed({
        command: process.execPath,
        args: [],
        allowedBins: ["node"],
        allowAbsolutePath: false,
      }),
    ).toThrow(/Blocked executable path/);
  });

  test("allows absolute path when allowAbsolutePath is true and basename is in allowedBins", () => {
    // Just verifying the allowlist check passes; child is not started here.
    // Use node itself so the binary definitely exists.
    const basename = path.basename(process.execPath).replace(/\.(exe)$/i, "");
    const child = spawnAllowed({
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      allowedBins: [basename],
      allowAbsolutePath: true,
    });
    child.kill("SIGKILL");
  });

  test("rejects binary not in allowedBins", () => {
    expect(() =>
      spawnAllowed({
        command: "definitely-not-allowed-bin",
        args: [],
        allowedBins: ["other-bin"],
      }),
    ).toThrow(/Blocked executable/);
  });

  test("stdout truncation is enforced by runAllowedCommand", async () => {
    await expect(
      runAllowedCommand({
        command: process.execPath,
        args: ["-e", "process.stdout.write('x'.repeat(5000))"],
        allowedBins: [path.basename(process.execPath).replace(/\.(exe)$/i, "")],
        allowAbsolutePath: true,
        timeoutMs: 5_000,
        maxStdoutBytes: 100,
      }),
    ).rejects.toThrow(/stdout exceeded/);
  });

  test("stderr truncation is enforced by runAllowedCommand", async () => {
    await expect(
      runAllowedCommand({
        command: process.execPath,
        args: ["-e", "process.stderr.write('e'.repeat(5000))"],
        allowedBins: [path.basename(process.execPath).replace(/\.(exe)$/i, "")],
        allowAbsolutePath: true,
        timeoutMs: 5_000,
        maxStderrBytes: 100,
      }),
    ).rejects.toThrow(/stderr exceeded/);
  });

  test("timeout is enforced by runAllowedCommand", async () => {
    await expect(
      runAllowedCommand({
        command: process.execPath,
        args: ["-e", "setTimeout(()=>{},60000)"],
        allowedBins: [path.basename(process.execPath).replace(/\.(exe)$/i, "")],
        allowAbsolutePath: true,
        timeoutMs: 200,
      }),
    ).rejects.toThrow(/timed out/);
  });

  test("env scrubbing strips blocked vars (NODE_OPTIONS, LD_PRELOAD)", () => {
    // sanitizeEnv is the runner's own layer; spawnAllowed's buildScrubbedEnv
    // enforces the blocked-key list independently.
    const env = sanitizeEnv(undefined, false);
    expect(env?.NODE_OPTIONS).toBeUndefined();
    expect(env?.LD_PRELOAD).toBeUndefined();
    expect(env?.DYLD_INSERT_LIBRARIES).toBeUndefined();
  });
});

