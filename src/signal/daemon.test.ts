import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";

const spawnAllowedMock = vi.hoisted(() => vi.fn());

vi.mock("../security/subprocess.js", () => ({
  spawnAllowed: spawnAllowedMock,
}));

import { classifySignalCliLogLine, spawnSignalDaemon } from "./daemon.js";

function createMockChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    killed: boolean;
    pid: number;
    kill: (signal?: string) => void;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.pid = 123;
  child.kill = vi.fn(() => {
    child.killed = true;
  });
  return child;
}

describe("classifySignalCliLogLine", () => {
  afterEach(() => {
    spawnAllowedMock.mockReset();
  });

  it("treats INFO/DEBUG as log (even if emitted on stderr)", () => {
    expect(classifySignalCliLogLine("INFO  DaemonCommand - Started")).toBe("log");
    expect(classifySignalCliLogLine("DEBUG Something")).toBe("log");
  });

  it("treats WARN/ERROR as error", () => {
    expect(classifySignalCliLogLine("WARN  Something")).toBe("error");
    expect(classifySignalCliLogLine("WARNING Something")).toBe("error");
    expect(classifySignalCliLogLine("ERROR Something")).toBe("error");
  });

  it("treats failures without explicit severity as error", () => {
    expect(classifySignalCliLogLine("Failed to initialize HTTP Server - oops")).toBe("error");
    expect(classifySignalCliLogLine('Exception in thread "main"')).toBe("error");
  });

  it("returns null for empty lines", () => {
    expect(classifySignalCliLogLine("")).toBe(null);
    expect(classifySignalCliLogLine("   ")).toBe(null);
  });

  it("uses fixed signal-cli executable allowlist for daemon spawn", () => {
    spawnAllowedMock.mockReturnValue(createMockChild());

    const handle = spawnSignalDaemon({
      cliPath: "/tmp/not-signal",
      httpHost: "127.0.0.1",
      httpPort: 8080,
    });
    expect(spawnAllowedMock).toHaveBeenCalledTimes(1);
    expect(spawnAllowedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "/tmp/not-signal",
        allowedBins: expect.arrayContaining(["signal-cli"]),
      }),
    );
    handle.stop();
  });
});
