import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { approveNodePairing, requestNodePairing, verifyNodeToken } from "./node-pairing.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-node-pairing-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) {
      continue;
    }
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

describe("verifyNodeToken", () => {
  it("accepts correct token and rejects invalid tokens", async () => {
    const baseDir = await makeTempDir();
    const request = await requestNodePairing({ nodeId: "node-1" }, baseDir);
    const approved = await approveNodePairing(request.request.requestId, baseDir);
    expect(approved).not.toBeNull();
    if (!approved) {
      return;
    }

    const ok = await verifyNodeToken("node-1", approved.node.token, baseDir);
    expect(ok.ok).toBe(true);

    const wrongSameLength = await verifyNodeToken(
      "node-1",
      approved.node.token.replace(/./g, "a"),
      baseDir,
    );
    expect(wrongSameLength.ok).toBe(false);

    const wrongLength = await verifyNodeToken("node-1", `${approved.node.token}x`, baseDir);
    expect(wrongLength.ok).toBe(false);
  });
});
