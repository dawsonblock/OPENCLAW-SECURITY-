import { describe, expect, it } from "vitest";
import {
  bm25RankToScore,
  buildFtsQuery,
  computeRecencyBoost,
  mergeHybridResults,
  mergeHybridResultsAdvanced,
  mergeRRF,
} from "./hybrid.js";

describe("memory hybrid helpers", () => {
  it("buildFtsQuery tokenizes and AND-joins", () => {
    expect(buildFtsQuery("hello world")).toBe('"hello" AND "world"');
    expect(buildFtsQuery("FOO_bar baz-1")).toBe('"FOO_bar" AND "baz" AND "1"');
    expect(buildFtsQuery("   ")).toBeNull();
  });

  it("bm25RankToScore is monotonic and clamped", () => {
    expect(bm25RankToScore(0)).toBeCloseTo(1);
    expect(bm25RankToScore(1)).toBeCloseTo(0.5);
    expect(bm25RankToScore(10)).toBeLessThan(bm25RankToScore(1));
    expect(bm25RankToScore(-100)).toBeCloseTo(1);
  });

  it("mergeHybridResults unions by id and combines weighted scores", () => {
    const merged = mergeHybridResults({
      vectorWeight: 0.7,
      textWeight: 0.3,
      vector: [
        {
          id: "a",
          path: "memory/a.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "vec-a",
          vectorScore: 0.9,
        },
      ],
      keyword: [
        {
          id: "b",
          path: "memory/b.md",
          startLine: 3,
          endLine: 4,
          source: "memory",
          snippet: "kw-b",
          textScore: 1.0,
        },
      ],
    });

    expect(merged).toHaveLength(2);
    const a = merged.find((r) => r.path === "memory/a.md");
    const b = merged.find((r) => r.path === "memory/b.md");
    expect(a?.score).toBeCloseTo(0.7 * 0.9);
    expect(b?.score).toBeCloseTo(0.3 * 1.0);
  });

  it("mergeHybridResults prefers keyword snippet when ids overlap", () => {
    const merged = mergeHybridResults({
      vectorWeight: 0.5,
      textWeight: 0.5,
      vector: [
        {
          id: "a",
          path: "memory/a.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "vec-a",
          vectorScore: 0.2,
        },
      ],
      keyword: [
        {
          id: "a",
          path: "memory/a.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "kw-a",
          textScore: 1.0,
        },
      ],
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]?.snippet).toBe("kw-a");
    expect(merged[0]?.score).toBeCloseTo(0.5 * 0.2 + 0.5 * 1.0);
  });
});

describe("computeRecencyBoost", () => {
  const config = { maxBoost: 0.15, halfLifeHours: 168 };

  it("returns 1.0 for undefined timestamp", () => {
    expect(computeRecencyBoost(undefined, Date.now(), config)).toBe(1.0);
  });

  it("returns full boost for brand-new items", () => {
    const now = Date.now();
    const boost = computeRecencyBoost(now, now, config);
    expect(boost).toBeCloseTo(1.15); // 1.0 + 0.15
  });

  it("decays to approximately half boost at half-life", () => {
    const now = Date.now();
    const halfLifeAgo = now - 168 * 60 * 60 * 1000; // 7 days ago
    const boost = computeRecencyBoost(halfLifeAgo, now, config);
    // At half-life: boost ≈ 1.0 + 0.15 * 0.5 = 1.075
    expect(boost).toBeCloseTo(1.075, 2);
  });

  it("returns near-zero boost for very old items", () => {
    const now = Date.now();
    const veryOld = now - 365 * 24 * 60 * 60 * 1000; // 1 year ago
    const boost = computeRecencyBoost(veryOld, now, config);
    expect(boost).toBeCloseTo(1.0, 1); // Boost decayed to ~0
  });
});

describe("mergeRRF", () => {
  it("ranks items appearing in both lists higher", () => {
    const results = mergeRRF({
      vector: [
        {
          id: "a",
          path: "a.md",
          startLine: 1,
          endLine: 2,
          source: "m",
          snippet: "a",
          vectorScore: 0.9,
        },
        {
          id: "b",
          path: "b.md",
          startLine: 1,
          endLine: 2,
          source: "m",
          snippet: "b",
          vectorScore: 0.5,
        },
      ],
      keyword: [
        {
          id: "a",
          path: "a.md",
          startLine: 1,
          endLine: 2,
          source: "m",
          snippet: "a",
          textScore: 0.8,
        },
        {
          id: "c",
          path: "c.md",
          startLine: 1,
          endLine: 2,
          source: "m",
          snippet: "c",
          textScore: 0.7,
        },
      ],
    });

    // "a" appears in both → highest RRF score
    expect(results[0].id).toBe("a");
    expect(results).toHaveLength(3);
  });

  it("uses positional ranking, not raw scores", () => {
    const results = mergeRRF({
      vector: [
        {
          id: "x",
          path: "x.md",
          startLine: 1,
          endLine: 2,
          source: "m",
          snippet: "x",
          vectorScore: 0.99,
        },
        {
          id: "y",
          path: "y.md",
          startLine: 1,
          endLine: 2,
          source: "m",
          snippet: "y",
          vectorScore: 0.01,
        },
      ],
      keyword: [],
    });
    // Despite large score gap, RRF only uses position
    const scoreGap = results[0].score - results[1].score;
    expect(scoreGap).toBeGreaterThan(0);
    expect(scoreGap).toBeLessThan(0.01); // Small gap — position-based
  });
});

describe("mergeHybridResultsAdvanced", () => {
  const mkVec = (id: string, score: number, createdAtMs?: number) => ({
    id,
    path: `${id}.md`,
    startLine: 1,
    endLine: 2,
    source: "m",
    snippet: id,
    vectorScore: score,
    createdAtMs,
  });

  const mkKw = (id: string, score: number, createdAtMs?: number) => ({
    id,
    path: `${id}.md`,
    startLine: 1,
    endLine: 2,
    source: "m",
    snippet: id,
    textScore: score,
    createdAtMs,
  });

  it("defaults to weighted strategy and is backward compatible", () => {
    const results = mergeHybridResultsAdvanced({
      vector: [mkVec("a", 0.9)],
      keyword: [mkKw("b", 1.0)],
      vectorWeight: 0.7,
      textWeight: 0.3,
      recencyBoost: false,
    });

    expect(results).toHaveLength(2);
    const a = results.find((r) => r.path === "a.md");
    expect(a?.score).toBeCloseTo(0.7 * 0.9);
  });

  it("applies recency boost to fresh items", () => {
    const now = Date.now();
    const results = mergeHybridResultsAdvanced({
      vector: [mkVec("fresh", 0.5, now), mkVec("old", 0.5, now - 30 * 24 * 60 * 60 * 1000)],
      keyword: [],
      vectorWeight: 1.0,
      textWeight: 0.0,
      nowMs: now,
      recencyBoost: { maxBoost: 0.15, halfLifeHours: 168 },
    });

    // Fresh item should score higher than old item despite same base score
    expect(results[0].path).toBe("fresh.md");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("uses RRF strategy when configured", () => {
    const results = mergeHybridResultsAdvanced({
      vector: [mkVec("a", 0.9), mkVec("b", 0.1)],
      keyword: [mkKw("a", 0.8)],
      strategy: "rrf",
      recencyBoost: false,
    });

    expect(results[0].path).toBe("a.md"); // In both lists → highest RRF
    expect(results).toHaveLength(2);
  });
});
