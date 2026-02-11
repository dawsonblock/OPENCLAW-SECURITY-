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
      proposal: buildProposal({ toolName: "unknown_tool", args: {} }),
      sandboxed: true,
    });

    expect(decision.verdict).toBe("deny");
    expect(decision.reasons).toContain("policy:tool_not_allowlisted");
  });

  test("enforces required capabilities", () => {
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["read"],
      toolRules: {
        read: {
          capabilitiesRequired: ["custom:capability"],
        },
      },
    });

    const decision = evaluateGate({
      policy,
      proposal: buildProposal({ toolName: "read", args: { path: "README.md" } }),
      sandboxed: true,
    });

    expect(decision.verdict).toBe("deny");
    expect(decision.reasons).toContain("capability_missing:custom:capability");
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
      proposal: buildProposal({ toolName: "exec", args: { command: "ls" } }),
      sandboxed: false,
    });

    expect(decision.verdict).toBe("require_sandbox_only");
    expect(decision.reasons).toContain("policy:sandbox_required");
  });

  test("enforces exec binary allowlist", () => {
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["exec"],
      grantedCapabilities: ["proc:manage"],
    });

    const denied = evaluateGate({
      policy,
      proposal: buildProposal({ toolName: "exec", args: { command: "python -V" } }),
      sandboxed: true,
    });
    expect(denied.verdict).toBe("deny");
    expect(denied.reasons).toContain("policy:exec_bin_not_allowlisted");

    const allowed = evaluateGate({
      policy,
      proposal: buildProposal({ toolName: "exec", args: { command: "ls" } }),
      sandboxed: true,
    });
    expect(allowed.verdict).toBe("allow");
    expect(allowed.capsGranted).toContain("proc:spawn:ls");
  });

  test("requires sandbox for exec/process tools by default", () => {
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["exec", "process"],
      grantedCapabilities: ["proc:manage"],
    });

    const execDecision = evaluateGate({
      policy,
      proposal: buildProposal({ toolName: "exec", args: { command: "ls" } }),
      sandboxed: false,
    });
    expect(execDecision.verdict).toBe("require_sandbox_only");

    const processDecision = evaluateGate({
      policy,
      proposal: buildProposal({ toolName: "process", args: { action: "list" } }),
      sandboxed: false,
    });
    expect(processDecision.verdict).toBe("require_sandbox_only");
  });

  test("denies exec attempts to override host/elevation fields", () => {
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["exec"],
      grantedCapabilities: ["proc:manage"],
    });

    const decision = evaluateGate({
      policy,
      proposal: buildProposal({
        toolName: "exec",
        args: {
          command: "ls",
          host: "gateway",
          elevated: true,
        },
      }),
      sandboxed: true,
    });

    expect(decision.verdict).toBe("deny");
    expect(decision.reasons).toContain("policy:exec_host_forbidden:gateway");
    expect(decision.reasons).toContain("policy:exec_elevated_forbidden");
  });

  test("enforces fetch domain allowlist and dynamic net capability", () => {
    const deniedPolicy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["web_fetch"],
      grantedCapabilities: ["net:outbound"],
    });
    const denied = evaluateGate({
      policy: deniedPolicy,
      proposal: buildProposal({
        toolName: "web_fetch",
        args: { url: "https://docs.openclaw.ai/configuration" },
      }),
      sandboxed: true,
    });
    expect(denied.verdict).toBe("deny");
    expect(denied.reasons).toContain("policy:net_domain_allowlist_empty");

    const allowedPolicy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["web_fetch"],
      fetchAllowedDomains: ["docs.openclaw.ai"],
      grantedCapabilities: ["net:outbound"],
    });
    const allowed = evaluateGate({
      policy: allowedPolicy,
      proposal: buildProposal({
        toolName: "web_fetch",
        args: { url: "https://docs.openclaw.ai/configuration" },
      }),
      sandboxed: true,
    });
    expect(allowed.verdict).toBe("allow");
    expect(allowed.capsGranted).toContain("net:outbound:docs.openclaw.ai");
  });

  test("supports wildcard capability grants", () => {
    const policy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["web_fetch"],
      fetchAllowedDomains: ["api.example.com"],
      grantedCapabilities: ["net:outbound", "net:outbound:*"],
    });

    const decision = evaluateGate({
      policy,
      proposal: buildProposal({
        toolName: "web_fetch",
        args: { url: "https://api.example.com/v1" },
      }),
      sandboxed: true,
    });
    expect(decision.verdict).toBe("allow");
  });
});
