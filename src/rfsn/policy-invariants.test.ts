import { describe, expect, test } from "vitest";
import { createDefaultRfsnPolicy } from "./policy.js";

describe("rfsn policy invariants", () => {
  test("default policy does not grant browser unsafe eval capability", () => {
    const policy = createDefaultRfsnPolicy();
    expect(policy.grantedCapabilities.has("browser:unsafe_eval")).toBe(false);
  });
});
