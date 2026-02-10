import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { RfsnLedgerEntry, RfsnLedgerEnvelope } from "./types.js";
import { redactForLedger } from "./redact.js";

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

export function resolveLedgerFilePath(params: {
  workspaceDir: string;
  sessionKey?: string;
  sessionId?: string;
}): string {
  const fileName = `${resolveSessionKey(params)}.jsonl`;
  return path.join(params.workspaceDir, ".openclaw", "ledger", fileName);
}

async function readPreviousHash(ledgerPath: string): Promise<string> {
  try {
    const raw = await fs.readFile(ledgerPath, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    if (lines.length === 0) {
      return "GENESIS";
    }
    const parsed = JSON.parse(lines.at(-1) ?? "{}") as { hash?: unknown };
    return typeof parsed.hash === "string" && parsed.hash.trim() ? parsed.hash : "GENESIS";
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return "GENESIS";
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

  const prevHash = await readPreviousHash(ledgerPath);
  const payload = redactForLedger(params.entry) as RfsnLedgerEntry;
  const hash = sha256Hex(prevHash + canonicalJson(payload));

  const line = JSON.stringify({ prevHash, hash, payload });
  await fs.appendFile(ledgerPath, `${line}\n`, "utf8");
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
