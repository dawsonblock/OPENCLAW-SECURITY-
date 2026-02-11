import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { RfsnLedgerEntry, RfsnLedgerEnvelope } from "./types.js";
import { redactForLedger } from "./redact.js";

const GENESIS_HASH = "GENESIS";
const LAST_HASH_FILE_SUFFIX = ".last_hash";

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

function sanitizeLedgerKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "unknown";
  }
  return trimmed.replace(/[^A-Za-z0-9._-]/g, "_");
}

function resolveSessionKey(params: { sessionKey?: string; sessionId?: string }): string {
  return sanitizeLedgerKey(params.sessionKey || params.sessionId || "unknown");
}

function resolveLedgerRoot(workspaceDir: string): string {
  const configured = process.env.OPENCLAW_LEDGER_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(workspaceDir, configured);
  }
  if (process.env.VITEST) {
    return path.join(os.tmpdir(), "openclaw-ledger-vitest");
  }
  return path.join(workspaceDir, ".openclaw", "ledger");
}

export function resolveLedgerFilePath(params: {
  workspaceDir: string;
  sessionKey?: string;
  sessionId?: string;
}): string {
  const fileName = `${resolveSessionKey(params)}.jsonl`;
  return path.join(resolveLedgerRoot(params.workspaceDir), fileName);
}

export function resolveLedgerLastHashPath(ledgerPath: string): string {
  return `${ledgerPath}${LAST_HASH_FILE_SUFFIX}`;
}

async function readLastHashFromSidecar(sidecarPath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(sidecarPath, "utf8");
    const hash = raw.trim();
    return hash ? hash : null;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeLastHashSidecar(sidecarPath: string, hash: string): Promise<void> {
  await fs.writeFile(sidecarPath, `${hash}\n`, "utf8");
}

function readLastHashFromLedgerRaw(raw: string): string {
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim();
    if (!line) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as { hash?: unknown };
      if (typeof parsed.hash === "string" && parsed.hash.trim()) {
        return parsed.hash.trim();
      }
    } catch {
      // Skip malformed tail lines and keep scanning backwards.
    }
  }
  return GENESIS_HASH;
}

async function readPreviousHash(ledgerPath: string): Promise<string> {
  const sidecarPath = resolveLedgerLastHashPath(ledgerPath);
  const sidecarHash = await readLastHashFromSidecar(sidecarPath);
  if (sidecarHash) {
    return sidecarHash;
  }

  try {
    const raw = await fs.readFile(ledgerPath, "utf8");
    const hash = readLastHashFromLedgerRaw(raw);
    await writeLastHashSidecar(sidecarPath, hash);
    return hash;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return GENESIS_HASH;
    }
    throw error;
  }
}

export async function appendLedgerEntry(params: {
  workspaceDir: string;
  sessionKey?: string;
  sessionId?: string;
  entry: RfsnLedgerEntry;
}): Promise<void> {
  const ledgerPath = resolveLedgerFilePath(params);
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  const sidecarPath = resolveLedgerLastHashPath(ledgerPath);

  const prevHash = await readPreviousHash(ledgerPath);
  const payload = redactForLedger(params.entry) as RfsnLedgerEntry;
  const hash = sha256Hex(prevHash + canonicalJson(payload));

  const line = JSON.stringify({ prevHash, hash, payload });
  await fs.appendFile(ledgerPath, `${line}\n`, "utf8");
  await writeLastHashSidecar(sidecarPath, hash);
}

export async function readLedgerEntries(ledgerPath: string): Promise<RfsnLedgerEnvelope[]> {
  try {
    const raw = await fs.readFile(ledgerPath, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line) as RfsnLedgerEnvelope);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
