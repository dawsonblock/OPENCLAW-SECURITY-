/**
 * Gate Feedback Loop — EMA-based adaptive risk adjustment.
 *
 * Consumes tool execution outcomes and adjusts effective risk scores
 * using an exponential moving average (EMA). Tools with high failure
 * rates are escalated; tools with consistently good outcomes can be
 * relaxed (within bounds).
 *
 * Opt-in via OPENCLAW_RFSN_ADAPTIVE_RISK=1.
 */

import type { RfsnRisk } from "./types.js";

// ── Config ────────────────────────────────────────────────────────────
const DEFAULT_ALPHA = 0.1; // EMA smoothing factor
const ESCALATION_THRESHOLD = 0.4; // error rate ≥40% → escalate
const DEESCALATION_THRESHOLD = 0.1; // error rate ≤10% → de-escalate
const MIN_SAMPLES = 5; // minimum observations before adjusting

/** Risk ordering for escalation ladder. */
const RISK_LEVELS: readonly RfsnRisk[] = ["low", "medium", "high"] as const;

/** Tools that are intrinsically dangerous may never drop below "medium". */
const INTRINSIC_HIGH_PATTERNS = [
  "exec",
  "bash",
  "process",
  "spawn",
  "fetch",
  "web",
  "browser",
  "http",
] as const;

// ── Types ─────────────────────────────────────────────────────────────

export type ToolOutcome = "success" | "error";

export type ToolStats = {
  /** Current EMA of error rate (0=all success, 1=all error). */
  errorRate: number;
  /** Total observations. */
  samples: number;
  /** Most recent risk adjustment (if any). */
  riskAdjustment: "escalated" | "deescalated" | "none";
};

// ── Tracker ───────────────────────────────────────────────────────────

export class GateFeedbackTracker {
  private readonly alpha: number;
  private readonly stats = new Map<string, { errorRate: number; samples: number }>();

  constructor(params?: { alpha?: number }) {
    this.alpha = params?.alpha ?? DEFAULT_ALPHA;
  }

  /** Record a tool execution outcome. */
  recordOutcome(toolName: string, outcome: ToolOutcome): void {
    const key = toolName.toLowerCase();
    const existing = this.stats.get(key) ?? { errorRate: 0, samples: 0 };
    const value = outcome === "error" ? 1 : 0;

    if (existing.samples === 0) {
      // First observation — initialize directly
      existing.errorRate = value;
    } else {
      // EMA update: errorRate = α * value + (1 - α) * prev
      existing.errorRate = this.alpha * value + (1 - this.alpha) * existing.errorRate;
    }
    existing.samples += 1;
    this.stats.set(key, existing);
  }

  /** Get current stats for a tool. Returns null if no observations. */
  getStats(toolName: string): ToolStats | null {
    const entry = this.stats.get(toolName.toLowerCase());
    if (!entry) {
      return null;
    }
    return {
      errorRate: entry.errorRate,
      samples: entry.samples,
      riskAdjustment: this.computeAdjustment(toolName, entry),
    };
  }

  /**
   * Resolve adaptive risk for a tool.
   * Takes the base (heuristic) risk and adjusts it based on observed outcomes.
   */
  resolveAdaptiveRisk(toolName: string, baseRisk: RfsnRisk): RfsnRisk {
    const entry = this.stats.get(toolName.toLowerCase());
    if (!entry || entry.samples < MIN_SAMPLES) {
      return baseRisk; // Not enough data — use heuristic
    }

    const adjustment = this.computeAdjustment(toolName, entry);
    const baseIdx = RISK_LEVELS.indexOf(baseRisk);

    if (adjustment === "escalated") {
      return RISK_LEVELS[Math.min(baseIdx + 1, RISK_LEVELS.length - 1)];
    }
    if (adjustment === "deescalated") {
      const floor = this.isIntrinsicHighRisk(toolName) ? 1 : 0; // "medium" floor for dangerous tools
      return RISK_LEVELS[Math.max(baseIdx - 1, floor)];
    }

    return baseRisk;
  }

  /** Reset all tracked stats. */
  reset(): void {
    this.stats.clear();
  }

  /** Get number of tracked tools. */
  get trackedToolCount(): number {
    return this.stats.size;
  }

  // ── Private ───────────────────────────────────────────────────────

  private computeAdjustment(
    toolName: string,
    entry: { errorRate: number; samples: number },
  ): "escalated" | "deescalated" | "none" {
    if (entry.samples < MIN_SAMPLES) {
      return "none";
    }
    if (entry.errorRate >= ESCALATION_THRESHOLD) {
      return "escalated";
    }
    if (entry.errorRate <= DEESCALATION_THRESHOLD) {
      // Never de-escalate intrinsically dangerous tools below medium
      if (this.isIntrinsicHighRisk(toolName)) {
        return "deescalated"; // resolveAdaptiveRisk enforces the floor
      }
      return "deescalated";
    }
    return "none";
  }

  private isIntrinsicHighRisk(toolName: string): boolean {
    const normalized = toolName.toLowerCase();
    return INTRINSIC_HIGH_PATTERNS.some((pattern) => normalized.includes(pattern));
  }
}

// ── Singleton ─────────────────────────────────────────────────────────

let _tracker: GateFeedbackTracker | null = null;

/** Get or create the global feedback tracker singleton. */
export function getGateFeedbackTracker(): GateFeedbackTracker {
  if (!_tracker) {
    _tracker = new GateFeedbackTracker();
  }
  return _tracker;
}

/** Check if adaptive risk mode is enabled. */
export function isAdaptiveRiskEnabled(): boolean {
  return process.env.OPENCLAW_RFSN_ADAPTIVE_RISK === "1";
}

/** Reset the global tracker (for testing). */
export function resetGateFeedbackTracker(): void {
  _tracker = null;
}
