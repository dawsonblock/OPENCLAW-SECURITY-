type DangerousActionLimiterOptions = {
  windowMs?: number;
  maxAttemptsPerWindow?: number;
  maxDenialsPerWindow?: number;
  blockMs?: number;
  maxSessions?: number;
  maxConcurrentPerSession?: number;
};

type DangerousActionState = {
  windowStartMs: number;
  attempts: number;
  denials: number;
  blockedUntilMs: number;
  lastSeenMs: number;
};

export type DangerousActionCheckResult =
  | { ok: true }
  | { ok: false; code: "BLOCKED" | "RATE_LIMITED" | "TOO_MANY_CONCURRENT"; reason: string };

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS_PER_WINDOW = 20;
const DEFAULT_MAX_DENIALS_PER_WINDOW = 5;
const DEFAULT_BLOCK_MS = 5 * 60_000;
const DEFAULT_MAX_SESSIONS = 5_000;
const DEFAULT_MAX_CONCURRENT_PER_SESSION = 2;

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

export class DangerousActionLimiter {
  private readonly windowMs: number;
  private readonly maxAttemptsPerWindow: number;
  private readonly maxDenialsPerWindow: number;
  private readonly blockMs: number;
  private readonly maxSessions: number;
  private readonly maxConcurrentPerSession: number;
  private readonly states = new Map<string, DangerousActionState>();
  private readonly activeCounts = new Map<string, number>();

  constructor(options?: DangerousActionLimiterOptions) {
    this.windowMs = normalizeLimit(options?.windowMs, DEFAULT_WINDOW_MS);
    this.maxAttemptsPerWindow = normalizeLimit(
      options?.maxAttemptsPerWindow,
      DEFAULT_MAX_ATTEMPTS_PER_WINDOW,
    );
    this.maxDenialsPerWindow = normalizeLimit(
      options?.maxDenialsPerWindow,
      DEFAULT_MAX_DENIALS_PER_WINDOW,
    );
    this.blockMs = normalizeLimit(options?.blockMs, DEFAULT_BLOCK_MS);
    this.maxSessions = normalizeLimit(options?.maxSessions, DEFAULT_MAX_SESSIONS);
    this.maxConcurrentPerSession = normalizeLimit(
      options?.maxConcurrentPerSession,
      DEFAULT_MAX_CONCURRENT_PER_SESSION,
    );
  }

  private getState(key: string, now: number): DangerousActionState {
    const existing = this.states.get(key);
    if (!existing) {
      const created: DangerousActionState = {
        windowStartMs: now,
        attempts: 0,
        denials: 0,
        blockedUntilMs: 0,
        lastSeenMs: now,
      };
      this.states.set(key, created);
      this.evictIfNeeded();
      return created;
    }
    if (now - existing.windowStartMs >= this.windowMs) {
      existing.windowStartMs = now;
      existing.attempts = 0;
      existing.denials = 0;
    }
    existing.lastSeenMs = now;
    return existing;
  }

  private evictIfNeeded() {
    if (this.states.size <= this.maxSessions) {
      return;
    }
    const sortedByLastSeen = [...this.states.entries()].toSorted(
      (left, right) => left[1].lastSeenMs - right[1].lastSeenMs,
    );
    const removeCount = Math.max(1, this.states.size - this.maxSessions);
    for (let index = 0; index < removeCount; index += 1) {
      const entry = sortedByLastSeen[index];
      if (entry) {
        this.states.delete(entry[0]);
      }
    }
  }

  checkAndConsume(key: string, now = Date.now()): DangerousActionCheckResult {
    const state = this.getState(key, now);
    if (state.blockedUntilMs > now) {
      return {
        ok: false,
        code: "BLOCKED",
        reason: `dangerous command temporarily blocked until ${state.blockedUntilMs}`,
      };
    }
    if (state.attempts >= this.maxAttemptsPerWindow) {
      this.noteDenial(key, now);
      return {
        ok: false,
        code: "RATE_LIMITED",
        reason: `dangerous command rate limit exceeded (${this.maxAttemptsPerWindow}/${this.windowMs}ms)`,
      };
    }
    state.attempts += 1;
    return { ok: true };
  }

  noteDenial(key: string, now = Date.now()): void {
    const state = this.getState(key, now);
    state.denials += 1;
    if (state.denials >= this.maxDenialsPerWindow) {
      state.blockedUntilMs = now + this.blockMs;
    }
  }

  noteSuccess(key: string, now = Date.now()): void {
    const state = this.getState(key, now);
    if (state.denials > 0) {
      state.denials -= 1;
    }
  }

  acquireConcurrency(key: string): DangerousActionCheckResult {
    const current = this.activeCounts.get(key) ?? 0;
    if (current >= this.maxConcurrentPerSession) {
      return {
        ok: false,
        code: "TOO_MANY_CONCURRENT",
        reason: `too many concurrent dangerous operations for session (limit: ${this.maxConcurrentPerSession})`,
      };
    }
    this.activeCounts.set(key, current + 1);
    return { ok: true };
  }

  releaseConcurrency(key: string): void {
    const current = this.activeCounts.get(key) ?? 0;
    if (current <= 1) {
      this.activeCounts.delete(key);
    } else {
      this.activeCounts.set(key, current - 1);
    }
  }
}
