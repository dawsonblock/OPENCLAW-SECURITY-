import fs from "fs";
import JSZip from "jszip";
import path from "path";
import type { OpenClawConfig } from "../config/config.js";
import { calculatePostureHash } from "../security/posture.js";

/**
 * Creates an incident bundle containing forensic data.
 * @param sessionId The session ID to bundle.
 * @param ledgerDir Directory containing ledger files.
 * @param config Current system configuration.
 * @param outDir Directory to write the zip file to.
 * @returns Path to the created zip file.
 */
export async function exportIncidentBundle(
  sessionId: string,
  ledgerDir: string,
  config: OpenClawConfig,
  outDir: string,
): Promise<string> {
  const zip = new JSZip();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // 1. Add Protocol/Manifest info
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        version: "1.0",
        sessionId,
        timestamp,
        generator: "aetherbot-forensics-bundle",
      },
      null,
      2,
    ),
  );

  // 2. Add Configuration & Posture
  const configString = JSON.stringify(config, null, 2);
  zip.file("config.json", configString);
  zip.file("posture.hash", calculatePostureHash(config));

  // 3. Add Ledger
  const ledgerPath = path.join(ledgerDir, `${sessionId}.jsonl`);
  if (fs.existsSync(ledgerPath)) {
    zip.file(`ledger-${sessionId}.jsonl`, fs.readFileSync(ledgerPath));
  } else {
    zip.file("ledger-missing.txt", `Ledger file not found at ${ledgerPath}`);
  }

  // 4. Add Logs (heuristic: look for session log adjacent to ledger or standard spot)
  // For now, we'll look in the same dir for .log, though usually logs are elsewhere.
  // This is a best-effort collection.
  const logPath = path.join(ledgerDir, `${sessionId}.log`);
  if (fs.existsSync(logPath)) {
    zip.file(`session-${sessionId}.log`, fs.readFileSync(logPath));
  }

  // Generate Zip
  const zipContent = await zip.generateAsync({ type: "nodebuffer" });

  const outFile = path.join(outDir, `incident-${sessionId}-${timestamp}.zip`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, zipContent);

  return outFile;
}
