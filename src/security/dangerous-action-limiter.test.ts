import { describe, expect, it } from "vitest";
import { DangerousActionLimiter } from "./dangerous-action-limiter.js";

describe("DangerousActionLimiter", () => {
  it("rate-limits excessive attempts", () => {
    const limiter = new DangerousActionLimiter({
      windowMs: 60_000,
      maxAttemptsPerWindow: 2,
      maxDenialsPerWindow: 5,
      blockMs: 30_000,
    });
    const now = 1_000;
    expect(limiter.checkAndConsume("s1", now)).toEqual({ ok: true });
    expect(limiter.checkAndConsume("s1", now + 1)).toEqual({ ok: true });
    const limited = limiter.checkAndConsume("s1", now + 2);
    expect(limited.ok).toBe(false);
    if (!limited.ok) {
      expect(limited.code).toBe("RATE_LIMITED");
    }
  });

  it("blocks after repeated denials and recovers after block window", () => {
    const limiter = new DangerousActionLimiter({
      windowMs: 60_000,
      maxAttemptsPerWindow: 10,
      maxDenialsPerWindow: 2,
      blockMs: 10_000,
    });
    const now = 10_000;
    limiter.noteDenial("s2", now);
    limiter.noteDenial("s2", now + 1);
    const blocked = limiter.checkAndConsume("s2", now + 2);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.code).toBe("BLOCKED");
    }

    const allowed = limiter.checkAndConsume("s2", now + 20_000);
    expect(allowed).toEqual({ ok: true });
  });
});
