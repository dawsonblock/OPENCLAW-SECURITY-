import { describe, expect, it } from "vitest";
import { OpenClawConfig } from "./config.js";
import { validateTightenOnly, PolicyError } from "./policy-overlay.js";

describe("Tighten-only Overlay", () => {
  it("allows restricting network allowlist", () => {
    const current: OpenClawConfig = {
      security: { network: { allowlist: ["google.com", "github.com"] } },
    };
    const proposed: OpenClawConfig = { security: { network: { allowlist: ["google.com"] } } };

    expect(() => validateTightenOnly(current, proposed)).not.toThrow();
  });

  it("forbids expanding network allowlist", () => {
    const current: OpenClawConfig = { security: { network: { allowlist: ["google.com"] } } };
    const proposed: OpenClawConfig = {
      security: { network: { allowlist: ["google.com", "yahoo.com"] } },
    };

    expect(() => validateTightenOnly(current, proposed)).toThrow(PolicyError);
    expect(() => validateTightenOnly(current, proposed)).toThrow(
      "Cannot add new network allowlist entry",
    );
  });

  it("handles empty current allowlist (allow all) as permissive baseline", () => {
    const current: OpenClawConfig = { security: { network: { allowlist: [] } } }; // Assume empty = all
    const proposed: OpenClawConfig = { security: { network: { allowlist: ["google.com"] } } };

    expect(() => validateTightenOnly(current, proposed)).not.toThrow();
  });

  it("forbids removing allowlist (regression to allow-all)", () => {
    const current: OpenClawConfig = { security: { network: { allowlist: ["google.com"] } } };
    const proposed: OpenClawConfig = { security: {} };

    expect(() => validateTightenOnly(current, proposed)).toThrow("Cannot remove network allowlist");
  });

  it("validates filesystem allowlist subset", () => {
    const current: OpenClawConfig = {
      agents: { defaults: { sandbox: { fs: { allow: ["/tmp", "/var"] } } } },
    };
    const proposedValid: OpenClawConfig = {
      agents: { defaults: { sandbox: { fs: { allow: ["/tmp"] } } } },
    };
    const proposedInvalid: OpenClawConfig = {
      agents: { defaults: { sandbox: { fs: { allow: ["/tmp", "/etc"] } } } },
    };

    expect(() => validateTightenOnly(current, proposedValid)).not.toThrow();
    expect(() => validateTightenOnly(current, proposedInvalid)).toThrow(
      "Cannot expand filesystem access",
    );
  });

  it("validates execution budget tightening", () => {
    const current: OpenClawConfig = {
      agents: { defaults: { sandbox: { executionBudget: { timeoutMs: 1000 } } } },
    };
    const proposedValid: OpenClawConfig = {
      agents: { defaults: { sandbox: { executionBudget: { timeoutMs: 500 } } } },
    };
    const proposedInvalid: OpenClawConfig = {
      agents: { defaults: { sandbox: { executionBudget: { timeoutMs: 2000 } } } },
    };

    expect(() => validateTightenOnly(current, proposedValid)).not.toThrow();
    expect(() => validateTightenOnly(current, proposedInvalid)).toThrow(
      "Cannot increase timeout budget",
    );
  });
});
