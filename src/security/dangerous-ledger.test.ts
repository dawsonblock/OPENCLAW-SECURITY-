import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendDangerousLedgerEntry } from "./dangerous-ledger.js";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-dangerous-ledger-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("appendDangerousLedgerEntry", () => {
  it("writes chained hashes", async () => {
    const dir = await makeTempDir();
    const first = await appendDangerousLedgerEntry({
      baseDir: dir,
      event: "dangerous.invoke.denied",
      payload: { command: "system.run" },
    });
    const second = await appendDangerousLedgerEntry({
      baseDir: dir,
      event: "dangerous.invoke.allowed",
      payload: { command: "system.run" },
    });

    expect(first.hash).not.toBe(second.hash);
    const chain = await fs.readFile(path.join(dir, "ledger", "dangerous.chain"), "utf8");
    expect(chain.trim()).toBe(second.hash);
    const lines = (await fs.readFile(path.join(dir, "ledger", "dangerous.jsonl"), "utf8"))
      .trim()
      .split("\n");
    expect(lines.length).toBe(2);
  });
});
