import crypto from "crypto";
import fs from "fs";
import readline from "readline";

const GENESIS_HASH = "GENESIS";

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted = Object.keys(record)
      .toSorted()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize(record[key]);
        return acc;
      }, {});
    return sorted;
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export type LedgerVerifyResult = {
  ok: boolean;
  entries: number;
  tipHash: string;
  error?: string;
  sidecarMatch?: boolean;
};

export async function verifyLedger(path: string): Promise<LedgerVerifyResult> {
  if (!fs.existsSync(path)) {
    return { ok: false, entries: 0, tipHash: "", error: `Ledger not found: ${path}` };
  }

  const stream = fs.createReadStream(path);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let prevHash = GENESIS_HASH;
  let lineNum = 0;
  let lastHash = GENESIS_HASH;

  for await (const line of rl) {
    lineNum++;
    if (!line.trim()) {
      continue;
    }

    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch (e) {
      return {
        ok: false,
        entries: lineNum,
        tipHash: lastHash,
        error: `JSON parse error at line ${lineNum}: ${String(e)}`,
      };
    }

    // Check header pointers
    const expectedPrev = entry.prevHash || "";
    if (expectedPrev !== prevHash) {
      return {
        ok: false,
        entries: lineNum,
        tipHash: lastHash,
        error: `Hash chain broken at line ${lineNum}. Expected prevHash '${prevHash}', got '${expectedPrev}'`,
      };
    }

    // Check content integrity
    // entry.payload should be the redacted, canonical payload we wrote.
    // verify hash = sha256(prevHash + canonicalJson(payload))
    // Note: The ledger writing code uses `canonicalJson(payload)` on the payload object.
    const computed = sha256Hex(prevHash + canonicalJson(entry.payload));

    if (computed !== entry.hash) {
      return {
        ok: false,
        entries: lineNum,
        tipHash: lastHash,
        error: `Entry hash mismatch at line ${lineNum}. Computed '${computed}', recorded '${entry.hash}'`,
      };
    }

    prevHash = entry.hash;
    lastHash = entry.hash;
  }

  // Check sidecar
  const sidecarPath = path + ".last_hash";
  try {
    const sidecarContent = await fs.promises.readFile(sidecarPath, "utf8");
    const sidecarHash = sidecarContent.trim();
    if (sidecarHash !== lastHash) {
      return {
        ok: false,
        entries: lineNum,
        tipHash: lastHash,
        sidecarMatch: false,
        error: `Sidecar mismatch. Ledger tip '${lastHash}', sidecar '${sidecarHash}'`,
      };
    }
  } catch (e) {
    // If sidecar missing/unreadable, separate warning? Or fail?
    // For strict forensics, missing sidecar is a failure.
    return {
      ok: false,
      entries: lineNum,
      tipHash: lastHash,
      sidecarMatch: false,
      error: `Sidecar read failed: ${String(e)}`,
    };
  }

  return {
    ok: true,
    entries: lineNum,
    tipHash: lastHash,
    sidecarMatch: true,
  };
}
