import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  approveDevicePairing,
  getPairedDevice,
  requestDevicePairing,
  rotateDeviceToken,
  verifyDeviceToken,
} from "./device-pairing.js";

describe("device pairing tokens", () => {
  test("preserves existing token scopes when rotating without scopes", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "openclaw-device-pairing-"));
    const request = await requestDevicePairing(
      {
        deviceId: "device-1",
        publicKey: "public-key-1",
        role: "operator",
        scopes: ["operator.admin"],
      },
      baseDir,
    );
    await approveDevicePairing(request.request.requestId, baseDir);

    await rotateDeviceToken({
      deviceId: "device-1",
      role: "operator",
      scopes: ["operator.read"],
      baseDir,
    });
    let paired = await getPairedDevice("device-1", baseDir);
    expect(paired?.tokens?.operator?.scopes).toEqual(["operator.read"]);
    expect(paired?.scopes).toEqual(["operator.read"]);

    await rotateDeviceToken({
      deviceId: "device-1",
      role: "operator",
      baseDir,
    });
    paired = await getPairedDevice("device-1", baseDir);
    expect(paired?.tokens?.operator?.scopes).toEqual(["operator.read"]);
  });

  test("verifies device token and rejects mismatches", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "openclaw-device-pairing-"));
    const request = await requestDevicePairing(
      {
        deviceId: "device-2",
        publicKey: "public-key-2",
        role: "operator",
        scopes: ["operator.read"],
      },
      baseDir,
    );
    await approveDevicePairing(request.request.requestId, baseDir);

    const paired = await getPairedDevice("device-2", baseDir);
    const token = paired?.tokens?.operator?.token;
    expect(typeof token).toBe("string");
    if (!token) {
      return;
    }

    const ok = await verifyDeviceToken({
      deviceId: "device-2",
      token,
      role: "operator",
      scopes: ["operator.read"],
      baseDir,
    });
    expect(ok).toEqual({ ok: true });

    const wrongSameLength = await verifyDeviceToken({
      deviceId: "device-2",
      token: token.replace(/./g, "a"),
      role: "operator",
      scopes: ["operator.read"],
      baseDir,
    });
    expect(wrongSameLength).toEqual({ ok: false, reason: "token-mismatch" });

    const wrongLength = await verifyDeviceToken({
      deviceId: "device-2",
      token: `${token}x`,
      role: "operator",
      scopes: ["operator.read"],
      baseDir,
    });
    expect(wrongLength).toEqual({ ok: false, reason: "token-mismatch" });
  });
});
