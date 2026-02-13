/**
 * Model Success Tracker — EMA-based success rate tracking for model fallback.
 *
 * Tracks per-model success rates and reorders fallback candidates by
 * observed performance. Models that fail frequently get deprioritized.
 *
 * Opt-in via OPENCLAW_ADAPTIVE_FALLBACK=1.
 */

// ── Config ────────────────────────────────────────────────────────────
const DEFAULT_ALPHA = 0.15; // Faster update than gate feedback — models change behavior frequently

// ── Types ─────────────────────────────────────────────────────────────

export type ModelOutcome = "success" | "failure";

export type ModelStats = {
  successRate: number;
  samples: number;
};

export type ModelCandidate = {
  provider: string;
  model: string;
};

// ── Tracker ───────────────────────────────────────────────────────────

export class ModelSuccessTracker {
  private readonly alpha: number;
  private readonly stats = new Map<string, { successRate: number; samples: number }>();

  constructor(params?: { alpha?: number }) {
    this.alpha = params?.alpha ?? DEFAULT_ALPHA;
  }

  private toKey(provider: string, model: string): string {
    return `${provider.toLowerCase()}/${model.toLowerCase()}`;
  }

  /** Record a model execution outcome. */
  recordOutcome(provider: string, model: string, outcome: ModelOutcome): void {
    const key = this.toKey(provider, model);
    const existing = this.stats.get(key) ?? { successRate: 1.0, samples: 0 };
    const value = outcome === "success" ? 1 : 0;

    if (existing.samples === 0) {
      existing.successRate = value;
    } else {
      // EMA update
      existing.successRate = this.alpha * value + (1 - this.alpha) * existing.successRate;
    }
    existing.samples += 1;
    this.stats.set(key, existing);
  }

  /** Get current stats for a model. */
  getStats(provider: string, model: string): ModelStats | null {
    const entry = this.stats.get(this.toKey(provider, model));
    if (!entry) {
      return null;
    }
    return { ...entry };
  }

  /**
   * Reorder candidate models by success rate (highest first).
   * Ties are broken by original config order (stable sort).
   */
  resolveAdaptiveCandidateOrder(candidates: ModelCandidate[]): ModelCandidate[] {
    if (candidates.length <= 1) {
      return candidates;
    }

    // Create indexed entries for stable sort
    const indexed = candidates.map((c, originalIdx) => ({
      candidate: c,
      originalIdx,
      successRate: this.stats.get(this.toKey(c.provider, c.model))?.successRate ?? 1.0,
    }));

    // Sort by success rate descending, then by original index ascending (stable)
    indexed.sort((a, b) => {
      const rateDiff = b.successRate - a.successRate;
      if (Math.abs(rateDiff) > 0.001) {
        return rateDiff;
      }
      return a.originalIdx - b.originalIdx; // Tie-break by config order
    });

    return indexed.map((e) => e.candidate);
  }

  /** Reset all tracked stats. */
  reset(): void {
    this.stats.clear();
  }

  /** Get number of tracked models. */
  get trackedModelCount(): number {
    return this.stats.size;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────

let _tracker: ModelSuccessTracker | null = null;

/** Get or create the global model success tracker singleton. */
export function getModelSuccessTracker(): ModelSuccessTracker {
  if (!_tracker) {
    _tracker = new ModelSuccessTracker();
  }
  return _tracker;
}

/** Check if adaptive fallback mode is enabled. */
export function isAdaptiveFallbackEnabled(): boolean {
  return process.env.OPENCLAW_ADAPTIVE_FALLBACK === "1";
}

/** Reset the global tracker (for testing). */
export function resetModelSuccessTracker(): void {
  _tracker = null;
}
