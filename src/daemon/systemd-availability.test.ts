import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileWithStatusMock = vi.hoisted(() => vi.fn());

vi.mock("../process/exec.js", () => ({
  execFileWithStatus: execFileWithStatusMock,
}));

import { isSystemdUserServiceAvailable } from "./systemd.js";

describe("systemd availability", () => {
  beforeEach(() => {
    execFileWithStatusMock.mockReset();
  });

  it("returns true when systemctl --user succeeds", async () => {
    execFileWithStatusMock.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
    await expect(isSystemdUserServiceAvailable()).resolves.toBe(true);
  });

  it("returns false when systemd user bus is unavailable", async () => {
    execFileWithStatusMock.mockResolvedValue({
      code: 1,
      stdout: "",
      stderr: "Failed to connect to bus",
    });
    await expect(isSystemdUserServiceAvailable()).resolves.toBe(false);
  });
});
