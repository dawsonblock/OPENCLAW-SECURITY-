import fs from "fs";
import JSZip from "jszip";
import os from "os";
import path from "path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { resolveLedgerFilePath } from "../rfsn/ledger.js";
import { exportIncidentBundle } from "./bundle.js";

describe("Forensics Bundle Export", () => {
  let tmpDir: string;
  let ledgerDir: string;
  let outDir: string;

  const mockConfig: OpenClawConfig = {
    security: { model: { providerAllowlist: ["a"] } },
    agents: {
      defaults: {
        sandbox: {
          fs: { allow: ["/"] },
          docker: { network: "none" },
          executionBudget: { timeoutMs: 100 },
        },
      },
    },
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-test-forensics-"));
    ledgerDir = path.join(tmpDir, "ledger");
    outDir = path.join(tmpDir, "out");

    fs.mkdirSync(ledgerDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a valid zip with manifest, config, and ledger", async () => {
    const sessionId = "sess-123";
    const ledgerFilePath = path.join(ledgerDir, `${sessionId}.jsonl`);
    fs.writeFileSync(ledgerFilePath, '{"entry":1}\n');

    const zipPath = await exportIncidentBundle(sessionId, ledgerFilePath, mockConfig, outDir);

    expect(fs.existsSync(zipPath)).toBe(true);

    // Verify Zip Contents
    const data = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(data);

    expect(zip.file("manifest.json")).not.toBeNull();
    expect(zip.file("config.json")).not.toBeNull();
    expect(zip.file(`ledger-${sessionId}.jsonl`)).not.toBeNull();

    const configContent = await zip.file("config.json")?.async("text");
    expect(JSON.parse(configContent!)).toEqual(mockConfig);
  });

  it("handles missing ledger gracefully", async () => {
    const sessionId = "missing-sess";
    const ledgerFilePath = path.join(ledgerDir, `${sessionId}.jsonl`);
    const zipPath = await exportIncidentBundle(sessionId, ledgerFilePath, mockConfig, outDir);

    const data = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(data);

    expect(zip.file("ledger-missing.txt")).not.toBeNull();
  });

  it("packages the exact ledger file that resolveLedgerFilePath resolves (default workspace path)", async () => {
    const sessionId = "workspace-sess";
    // Simulate the workspace layout that rfsnDispatch uses: workspaceDir/.openclaw/ledger/<sessionId>.jsonl
    const workspaceDir = tmpDir;
    const expectedLedgerDir = path.join(workspaceDir, ".openclaw", "ledger");
    fs.mkdirSync(expectedLedgerDir, { recursive: true });
    const expectedContent = '{"type":"proposal"}\n';
    fs.writeFileSync(path.join(expectedLedgerDir, `${sessionId}.jsonl`), expectedContent);

    const ledgerFilePath = resolveLedgerFilePath({ workspaceDir, sessionId });
    const zipPath = await exportIncidentBundle(sessionId, ledgerFilePath, mockConfig, outDir);

    const data = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(data);
    const ledgerEntry = zip.file(`ledger-${sessionId}.jsonl`);
    expect(ledgerEntry).not.toBeNull();
    const content = await ledgerEntry!.async("text");
    expect(content).toBe(expectedContent);
  });

  it("respects OPENCLAW_LEDGER_DIR override in resolveLedgerFilePath", async () => {
    const sessionId = "override-sess";
    const customLedgerDir = path.join(tmpDir, "custom-ledger");
    fs.mkdirSync(customLedgerDir, { recursive: true });
    const expectedContent = '{"type":"result"}\n';
    fs.writeFileSync(path.join(customLedgerDir, `${sessionId}.jsonl`), expectedContent);

    const previousValue = process.env.OPENCLAW_LEDGER_DIR;
    process.env.OPENCLAW_LEDGER_DIR = customLedgerDir;
    try {
      const ledgerFilePath = resolveLedgerFilePath({ workspaceDir: tmpDir, sessionId });
      const zipPath = await exportIncidentBundle(sessionId, ledgerFilePath, mockConfig, outDir);

      const data = fs.readFileSync(zipPath);
      const zip = await JSZip.loadAsync(data);
      const ledgerEntry = zip.file(`ledger-${sessionId}.jsonl`);
      expect(ledgerEntry).not.toBeNull();
      const content = await ledgerEntry!.async("text");
      expect(content).toBe(expectedContent);
    } finally {
      if (previousValue === undefined) {
        delete process.env.OPENCLAW_LEDGER_DIR;
      } else {
        process.env.OPENCLAW_LEDGER_DIR = previousValue;
      }
    }
  });
});
