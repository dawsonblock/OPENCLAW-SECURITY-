import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { RfsnLedgerEntry } from "./types.js";
import {
  appendLedgerEntry,
  readLedgerEntries,
  resolveLedgerFilePath,
  resolveLedgerLastHashPath,
} from "./ledger.js";

async function createTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "openclaw-rfsn-ledger-"));
}

function entry(index: number): RfsnLedgerEntry {
  return {
    type: "proposal",
    timestampMs: 1000 + index,
    proposal: {
      id: `proposal-${index}`,
      timestampMs: 1000 + index,
      actor: "tester",
      toolName: "read",
      args: { index },
    },
  };
}

describe("rfsn ledger sidecar hash", () => {
  test("writes and updates the last-hash sidecar on append", async () => {
    const workspaceDir = await createTmpDir();
    const sessionId = "session-sidecar-write";
    const ledgerPath = resolveLedgerFilePath({ workspaceDir, sessionId });
    const sidecarPath = resolveLedgerLastHashPath(ledgerPath);

    await appendLedgerEntry({ workspaceDir, sessionId, entry: entry(1) });
    let envelopes = await readLedgerEntries(ledgerPath);
    expect(envelopes).toHaveLength(1);
    let sidecar = await fs.readFile(sidecarPath, "utf8");
    expect(sidecar.trim()).toBe(envelopes[0]?.hash);

    await appendLedgerEntry({ workspaceDir, sessionId, entry: entry(2) });
    envelopes = await readLedgerEntries(ledgerPath);
    expect(envelopes).toHaveLength(2);
    sidecar = await fs.readFile(sidecarPath, "utf8");
    expect(sidecar.trim()).toBe(envelopes[1]?.hash);
  });

  test("rebuilds sidecar from ledger when sidecar is missing", async () => {
    const workspaceDir = await createTmpDir();
    const sessionId = "session-sidecar-rebuild";
    const ledgerPath = resolveLedgerFilePath({ workspaceDir, sessionId });
    const sidecarPath = resolveLedgerLastHashPath(ledgerPath);

    await appendLedgerEntry({ workspaceDir, sessionId, entry: entry(1) });
    const first = await readLedgerEntries(ledgerPath);
    expect(first).toHaveLength(1);
    await fs.rm(sidecarPath, { force: true });

    await appendLedgerEntry({ workspaceDir, sessionId, entry: entry(2) });
    const envelopes = await readLedgerEntries(ledgerPath);
    expect(envelopes).toHaveLength(2);
    expect(envelopes[1]?.prevHash).toBe(envelopes[0]?.hash);

    const sidecar = await fs.readFile(sidecarPath, "utf8");
    expect(sidecar.trim()).toBe(envelopes[1]?.hash);
  });

  test("ignores invalid sidecar and repairs it from ledger", async () => {
    const workspaceDir = await createTmpDir();
    const sessionId = "session-sidecar-invalid";
    const ledgerPath = resolveLedgerFilePath({ workspaceDir, sessionId });
    const sidecarPath = resolveLedgerLastHashPath(ledgerPath);

    await appendLedgerEntry({ workspaceDir, sessionId, entry: entry(1) });
    const first = await readLedgerEntries(ledgerPath);
    expect(first).toHaveLength(1);

    await fs.writeFile(sidecarPath, "\n", "utf8");

    await appendLedgerEntry({ workspaceDir, sessionId, entry: entry(2) });
    const envelopes = await readLedgerEntries(ledgerPath);
    expect(envelopes).toHaveLength(2);
    expect(envelopes[1]?.prevHash).toBe(envelopes[0]?.hash);

    const sidecar = await fs.readFile(sidecarPath, "utf8");
    expect(sidecar.trim()).toBe(envelopes[1]?.hash);
  });
});
