import { describe, expect, test } from "vitest";
import type { RfsnActionProposal } from "./types.js";
import { evaluateGate } from "./gate.js";
import { createDefaultRfsnPolicy } from "./policy.js";

function buildProposal(overrides?: Partial<RfsnActionProposal>): RfsnActionProposal {
  return {
    id: "proposal-1",
    timestampMs: Date.now(),
    actor: "embedded-agent",
    sessionId: "session-1",
    sessionKey: "session:key",
    toolName: "read",
    args: { path: "README.md" },
    ...overrides,
  };
}

describe("evaluateGate", () => {
  test("allows allowlisted tools", () => {
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["read"],
    });

    const decision = evaluateGate({
      policy,
      proposal: buildProposal(),
      sandboxed: true,
    });

    expect(decision.verdict).toBe("allow");
  });

  test("denies tools outside allowlist", () => {
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["read"],
    });

    const decision = evaluateGate({
      policy,
      proposal: buildProposal({ toolName: "exec" }),
      sandboxed: true,
    });

    expect(decision.verdict).toBe("deny");
    expect(decision.reasons).toContain("policy:tool_not_allowlisted");
  });

  test("enforces required capabilities", () => {
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["web_fetch"],
      toolRules: {
        web_fetch: {
          capabilitiesRequired: ["net:outbound:api.example.com"],
        },
      },
    });

    const decision = evaluateGate({
      policy,
      proposal: buildProposal({ toolName: "web_fetch", args: { url: "https://api.example.com" } }),
      sandboxed: true,
    });

    expect(decision.verdict).toBe("deny");
    expect(decision.reasons).toContain("capability_missing:net:outbound:api.example.com");
  });

  test("returns require_sandbox_only when the rule requires sandbox", () => {
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["exec"],
      toolRules: {
        exec: {
          requireSandbox: true,
        },
      },
    });

    const decision = evaluateGate({
      policy,
      proposal: buildProposal({ toolName: "exec" }),
      sandboxed: false,
    });

    expect(decision.verdict).toBe("require_sandbox_only");
    expect(decision.reasons).toContain("policy:sandbox_required");
  });
});
