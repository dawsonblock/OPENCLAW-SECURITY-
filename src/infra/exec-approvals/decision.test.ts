import { describe, expect, it } from "vitest";
import { maxAsk, minSecurity, requiresExecApproval } from "../exec-approvals.js";

describe("exec approvals decision", () => {
  it("minSecurity returns the more restrictive value", () => {
    expect(minSecurity("deny", "full")).toBe("deny");
    expect(minSecurity("allowlist", "full")).toBe("allowlist");
  });

  it("maxAsk returns the more aggressive ask mode", () => {
    expect(maxAsk("off", "always")).toBe("always");
    expect(maxAsk("on-miss", "off")).toBe("on-miss");
  });

  it("requiresExecApproval respects ask mode and allowlist satisfaction", () => {
    expect(
      requiresExecApproval({
        ask: "always",
        security: "allowlist",
        analysisOk: true,
        allowlistSatisfied: true,
      }),
    ).toBe(true);
    expect(
      requiresExecApproval({
        ask: "off",
        security: "allowlist",
        analysisOk: true,
        allowlistSatisfied: false,
      }),
    ).toBe(false);
    expect(
      requiresExecApproval({
        ask: "on-miss",
        security: "allowlist",
        analysisOk: true,
        allowlistSatisfied: true,
      }),
    ).toBe(false);
    expect(
      requiresExecApproval({
        ask: "on-miss",
        security: "allowlist",
        analysisOk: false,
        allowlistSatisfied: false,
      }),
    ).toBe(true);
    expect(
      requiresExecApproval({
        ask: "on-miss",
        security: "full",
        analysisOk: false,
        allowlistSatisfied: false,
      }),
    ).toBe(false);
  });
});
