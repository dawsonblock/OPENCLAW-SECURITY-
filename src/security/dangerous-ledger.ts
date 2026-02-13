import fs from "node:fs/promises";
import path from "node:path";
import { hashPayload, stableJson } from "./stable-hash.js";

export type DangerousLedgerEntry = {
  ts: number;
  event: string;
  payload: Record<string, unknown>;
};

function resolveLedgerPaths(baseDir: string) {
  const dir = path.resolve(baseDir, "ledger");
  return {
    dir,
    logPath: path.join(dir, "dangerous.jsonl"),
    chainPath: path.join(dir, "dangerous.chain"),
  };
}

async function readChainHead(chainPath: string): Promise<string> {
  try {
    const raw = await fs.readFile(chainPath, "utf8");
    return raw.trim();
  } catch {
    return "";
  }
}

export async function appendDangerousLedgerEntry(params: {
  baseDir: string;
  event: string;
  payload: Record<string, unknown>;
}): Promise<{ hash: string }> {
  const { dir, logPath, chainPath } = resolveLedgerPaths(params.baseDir);
  await fs.mkdir(dir, { recursive: true });
  const prevHash = await readChainHead(chainPath);
  const entry: DangerousLedgerEntry = {
    ts: Date.now(),
    event: params.event,
    payload: params.payload,
  };
  const entryCanonical = stableJson(entry);
  const hash = hashPayload({ prevHash, entry: entryCanonical });
  const line = JSON.stringify({ hash, prevHash, entry }) + "\n";
  await fs.appendFile(logPath, line, "utf8");
  await fs.writeFile(chainPath, `${hash}\n`, "utf8");
  return { hash };
}
