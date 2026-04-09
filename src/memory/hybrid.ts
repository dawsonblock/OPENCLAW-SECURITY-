export type HybridSource = string;

export type HybridVectorResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: HybridSource;
  snippet: string;
  vectorScore: number;
};

export type HybridKeywordResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: HybridSource;
  snippet: string;
  textScore: number;
};

export function buildFtsQuery(raw: string): string | null {
  const tokens =
    raw
      .match(/[A-Za-z0-9_]+/g)
      ?.map((t) => t.trim())
      .filter(Boolean) ?? [];
  if (tokens.length === 0) {
    return null;
  }
  const quoted = tokens.map((t) => `"${t.replaceAll('"', "")}"`);
  return quoted.join(" AND ");
}

export function bm25RankToScore(rank: number): number {
  const normalized = Number.isFinite(rank) ? Math.max(0, rank) : 999;
  return 1 / (1 + normalized);
}

export function mergeHybridResults(params: {
  vector: HybridVectorResult[];
  keyword: HybridKeywordResult[];
  vectorWeight: number;
  textWeight: number;
}): Array<{
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: HybridSource;
}> {
  const byId = new Map<
    string,
    {
      id: string;
      path: string;
      startLine: number;
      endLine: number;
      source: HybridSource;
      snippet: string;
      vectorScore: number;
      textScore: number;
    }
  >();

  for (const r of params.vector) {
    byId.set(r.id, {
      id: r.id,
      path: r.path,
      startLine: r.startLine,
      endLine: r.endLine,
      source: r.source,
      snippet: r.snippet,
      vectorScore: r.vectorScore,
      textScore: 0,
    });
  }

  for (const r of params.keyword) {
    const existing = byId.get(r.id);
    if (existing) {
      existing.textScore = r.textScore;
      if (r.snippet && r.snippet.length > 0) {
        existing.snippet = r.snippet;
      }
    } else {
      byId.set(r.id, {
        id: r.id,
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        source: r.source,
        snippet: r.snippet,
        vectorScore: 0,
        textScore: r.textScore,
      });
    }
  }

  const merged = Array.from(byId.values()).map((entry) => {
    const score = params.vectorWeight * entry.vectorScore + params.textWeight * entry.textScore;
    return {
      path: entry.path,
      startLine: entry.startLine,
      endLine: entry.endLine,
      score,
      snippet: entry.snippet,
      source: entry.source,
    };
  });

  return merged.toSorted((a, b) => b.score - a.score);
}

// ── Advanced Hybrid Merge ─────────────────────────────────────────────

export type HybridMergeStrategy = "weighted" | "rrf";

export type RecencyBoostConfig = {
  /** Maximum boost multiplier for fresh results (default: 0.15 = 15% boost). */
  maxBoost: number;
  /** Half-life in hours for decay (default: 168 = 7 days). */
  halfLifeHours: number;
};

const DEFAULT_RRF_K = 60;
const DEFAULT_RECENCY_BOOST: RecencyBoostConfig = {
  maxBoost: 0.15,
  halfLifeHours: 168, // 7 days
};

/**
 * Compute exponential time-decay recency boost.
 * Returns a multiplier ∈ [1.0, 1.0 + maxBoost].
 * Fresh items get the full boost; it decays exponentially with age.
 */
export function computeRecencyBoost(
  createdAtMs: number | undefined,
  nowMs: number,
  config: RecencyBoostConfig,
): number {
  if (!createdAtMs || !Number.isFinite(createdAtMs) || createdAtMs <= 0) {
    return 1.0; // No timestamp → no boost
  }
  const ageMs = Math.max(0, nowMs - createdAtMs);
  const ageHours = ageMs / (1000 * 60 * 60);
  // Exponential decay: boost = maxBoost * exp(-ageHours * ln(2) / halfLifeHours)
  const decay = Math.exp((-ageHours * Math.LN2) / config.halfLifeHours);
  return 1.0 + config.maxBoost * decay;
}

/**
 * Reciprocal Rank Fusion — merges two ranked lists using position-based scoring.
 * More robust than weighted linear when scores are on incomparable scales.
 *
 * score(d) = 1/(k + rank_vector(d)) + 1/(k + rank_keyword(d))
 */
export function mergeRRF(params: {
  vector: HybridVectorResult[];
  keyword: HybridKeywordResult[];
  k?: number;
}): Array<{
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: HybridSource;
}> {
  const k = params.k ?? DEFAULT_RRF_K;
  const byId = new Map<
    string,
    {
      id: string;
      path: string;
      startLine: number;
      endLine: number;
      source: HybridSource;
      snippet: string;
      score: number;
    }
  >();

  // Score from vector ranking
  for (let rank = 0; rank < params.vector.length; rank++) {
    const r = params.vector[rank];
    byId.set(r.id, {
      id: r.id,
      path: r.path,
      startLine: r.startLine,
      endLine: r.endLine,
      source: r.source,
      snippet: r.snippet,
      score: 1 / (k + rank + 1), // 1-based rank
    });
  }

  // Score from keyword ranking
  for (let rank = 0; rank < params.keyword.length; rank++) {
    const r = params.keyword[rank];
    const existing = byId.get(r.id);
    if (existing) {
      existing.score += 1 / (k + rank + 1);
      if (r.snippet && r.snippet.length > 0) {
        existing.snippet = r.snippet;
      }
    } else {
      byId.set(r.id, {
        id: r.id,
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        source: r.source,
        snippet: r.snippet,
        score: 1 / (k + rank + 1),
      });
    }
  }

  return Array.from(byId.values()).toSorted((a, b) => b.score - a.score);
}

export type AdvancedHybridEntry = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: HybridSource;
  snippet: string;
  vectorScore?: number;
  textScore?: number;
  createdAtMs?: number;
};

/**
 * Advanced hybrid merge supporting both weighted-linear and RRF strategies,
 * with optional recency boost.
 */
export function mergeHybridResultsAdvanced(params: {
  vector: (HybridVectorResult & { createdAtMs?: number })[];
  keyword: (HybridKeywordResult & { createdAtMs?: number })[];
  strategy?: HybridMergeStrategy;
  vectorWeight?: number;
  textWeight?: number;
  recencyBoost?: RecencyBoostConfig | false;
  nowMs?: number;
}): Array<{
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: HybridSource;
}> {
  const strategy = params.strategy ?? "weighted";
  const recencyConfig =
    params.recencyBoost === false ? null : (params.recencyBoost ?? DEFAULT_RECENCY_BOOST);
  const nowMs = params.nowMs ?? Date.now();

  // Collect createdAt timestamps by id for recency boost
  const createdAtById = new Map<string, number>();
  for (const r of params.vector) {
    if (r.createdAtMs) {
      createdAtById.set(r.id, r.createdAtMs);
    }
  }
  for (const r of params.keyword) {
    if (r.createdAtMs && !createdAtById.has(r.id)) {
      createdAtById.set(r.id, r.createdAtMs);
    }
  }

  let results: Array<{
    id?: string;
    path: string;
    startLine: number;
    endLine: number;
    score: number;
    snippet: string;
    source: HybridSource;
  }>;

  if (strategy === "rrf") {
    results = mergeRRF({ vector: params.vector, keyword: params.keyword });
  } else {
    // Use existing weighted linear merge
    const rawMerged = mergeHybridResults({
      vector: params.vector,
      keyword: params.keyword,
      vectorWeight: params.vectorWeight ?? 0.7,
      textWeight: params.textWeight ?? 0.3,
    });
    // Attach IDs for recency lookup
    const idLookup = new Map<string, string>();
    for (const r of params.vector) {
      idLookup.set(`${r.path}:${r.startLine}`, r.id);
    }
    for (const r of params.keyword) {
      idLookup.set(`${r.path}:${r.startLine}`, r.id);
    }

    results = rawMerged.map((r) => ({
      ...r,
      id: idLookup.get(`${r.path}:${r.startLine}`),
    }));
  }

  // Apply recency boost
  if (recencyConfig) {
    results = results.map((r) => {
      const createdAt = r.id ? createdAtById.get(r.id) : undefined;
      const boost = computeRecencyBoost(createdAt, nowMs, recencyConfig);
      return { ...r, score: r.score * boost };
    });
  }

  return results.map(({ id: _id, ...rest }) => rest).toSorted((a, b) => b.score - a.score);
}
