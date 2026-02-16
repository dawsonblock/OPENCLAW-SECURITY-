import { randomUUID } from "node:crypto";
import type { ExecApprovalDecision } from "../infra/exec-approvals.js";
import { hashPayload } from "../security/stable-hash.js";
import { isSafeModeEnabled } from "../security/startup-validator.js";

export type ExecApprovalRequestPayload = {
  command: string;
  commandArgv?: string[] | null;
  commandEnv?: Record<string, string> | null;
  cwd?: string | null;
  host?: string | null;
  security?: string | null;
  ask?: string | null;
  agentId?: string | null;
  resolvedPath?: string | null;
  sessionKey?: string | null;
};

export type ExecApprovalRecord = {
  id: string;
  request: ExecApprovalRequestPayload;
  createdAtMs: number;
  expiresAtMs: number;
  resolvedAtMs?: number;
  decision?: ExecApprovalDecision;
  resolvedBy?: string | null;
};

type PendingEntry = {
  record: ExecApprovalRecord;
  resolve: (decision: ExecApprovalDecision | null) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class ExecApprovalManager {
  private pending = new Map<string, PendingEntry>();
  private tokens = new Map<string, { bindHash: string; expiresAtMs: number }>();
  private tokenTtlMs = 2 * 60_000;

  private cleanupTokens(now: number) {
    for (const [token, entry] of this.tokens.entries()) {
      if (entry.expiresAtMs <= now) {
        this.tokens.delete(token);
      }
    }
  }

  private normalizeCommandEnv(env?: Record<string, string> | null): Record<string, string> | null {
    if (!env || typeof env !== "object") {
      return null;
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (!key.trim() || typeof value !== "string") {
        continue;
      }
      out[key] = value;
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  private normalizeCommandArgv(argv?: string[] | null): string[] | null {
    if (!Array.isArray(argv)) {
      return null;
    }
    return argv.map((token) => String(token));
  }

  computeBindHash(request: ExecApprovalRequestPayload): string {
    const payload = {
      command: request.command,
      commandArgv: this.normalizeCommandArgv(request.commandArgv),
      commandEnv: this.normalizeCommandEnv(request.commandEnv),
      cwd: request.cwd ?? null,
      host: request.host ?? null,
      security: request.security ?? null,
      ask: request.ask ?? null,
      agentId: request.agentId ?? null,
      resolvedPath: request.resolvedPath ?? null,
      sessionKey: request.sessionKey ?? null,
    };
    return hashPayload(payload);
  }

  issueToken(bindHash: string): string {
    const now = Date.now();
    this.cleanupTokens(now);
    const ttlMs = isSafeModeEnabled(process.env)
      ? Math.min(this.tokenTtlMs, 30_000)
      : this.tokenTtlMs;
    const token = randomUUID();
    this.tokens.set(token, {
      bindHash,
      expiresAtMs: now + ttlMs,
    });
    return token;
  }

  consumeToken(token: string, expectedBindHash: string): boolean {
    const now = Date.now();
    this.cleanupTokens(now);
    const entry = this.tokens.get(token);
    if (!entry) {
      return false;
    }
    if (entry.expiresAtMs <= now) {
      this.tokens.delete(token);
      return false;
    }
    if (entry.bindHash !== expectedBindHash) {
      return false;
    }
    this.tokens.delete(token);
    return true;
  }

  create(
    request: ExecApprovalRequestPayload,
    timeoutMs: number,
    id?: string | null,
  ): ExecApprovalRecord {
    const now = Date.now();
    const resolvedId = id && id.trim().length > 0 ? id.trim() : randomUUID();
    const record: ExecApprovalRecord = {
      id: resolvedId,
      request,
      createdAtMs: now,
      expiresAtMs: now + timeoutMs,
    };
    return record;
  }

  async waitForDecision(
    record: ExecApprovalRecord,
    timeoutMs: number,
  ): Promise<ExecApprovalDecision | null> {
    return await new Promise<ExecApprovalDecision | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(record.id);
        resolve(null);
      }, timeoutMs);
      this.pending.set(record.id, { record, resolve, reject, timer });
    });
  }

  resolve(recordId: string, decision: ExecApprovalDecision, resolvedBy?: string | null): boolean {
    const pending = this.pending.get(recordId);
    if (!pending) {
      return false;
    }
    clearTimeout(pending.timer);
    pending.record.resolvedAtMs = Date.now();
    pending.record.decision = decision;
    pending.record.resolvedBy = resolvedBy ?? null;
    this.pending.delete(recordId);
    pending.resolve(decision);
    return true;
  }

  getSnapshot(recordId: string): ExecApprovalRecord | null {
    const entry = this.pending.get(recordId);
    return entry?.record ?? null;
  }
}
