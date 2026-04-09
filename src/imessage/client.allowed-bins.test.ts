import { describe, expect, it } from "vitest";
import { resolveIMessageCliAllowedBins } from "./client.js";

describe("resolveIMessageCliAllowedBins", () => {
  it("always includes the canonical imsg binary name", () => {
    expect(resolveIMessageCliAllowedBins()).toContain("imsg");
  });
});
