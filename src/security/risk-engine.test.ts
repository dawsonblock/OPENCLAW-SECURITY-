import { describe, expect, it } from "vitest";
import { calculateRisk, RiskScore } from "./risk-engine.js";

describe("Risk Engine", () => {
  it("scores read operations as LOW", () => {
    const assessment = calculateRisk("read_file", { path: "/tmp/test" });
    expect(assessment.score).toBe(RiskScore.LOW);
  });

  it("scores write operations as MEDIUM", () => {
    const assessment = calculateRisk("write_to_file", { path: "/tmp/test" });
    expect(assessment.score).toBe(RiskScore.MEDIUM);
  });

  it("scores execution operations as HIGH", () => {
    const assessment = calculateRisk("run_command", { command: "rm -rf /" });
    expect(assessment.score).toBe(RiskScore.HIGH);
  });

  it("scores network operations as MEDIUM", () => {
    const assessment = calculateRisk("network_proxy", { url: "https://google.com" });
    expect(assessment.score).toBe(RiskScore.MEDIUM);
  });

  it("defaults unknown tools to LOW", () => {
    const assessment = calculateRisk("unknown_tool", {});
    expect(assessment.score).toBe(RiskScore.LOW);
  });
});
