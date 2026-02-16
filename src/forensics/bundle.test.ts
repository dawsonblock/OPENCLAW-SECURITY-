import fs from "fs";
import JSZip from "jszip";
import os from "os";
import path from "path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
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
    // Create fake ledger
    fs.writeFileSync(path.join(ledgerDir, `${sessionId}.jsonl`), '{"entry":1}\n');

    const zipPath = await exportIncidentBundle(sessionId, ledgerDir, mockConfig, outDir);

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
    const zipPath = await exportIncidentBundle(sessionId, ledgerDir, mockConfig, outDir);

    const data = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(data);

    expect(zip.file("ledger-missing.txt")).not.toBeNull();
  });
});
