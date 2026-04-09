import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  collectAttackSurfaceSummaryFindings,
  collectExposureMatrixFindings,
  collectHooksHardeningFindings,
  collectModelHygieneFindings,
  collectSecretsInConfigFindings,
  collectSmallModelRiskFindings,
  collectSyncedFolderFindings,
} from "./audit-extra.sync.js";

// ---------------------------------------------------------------------------
// collectAttackSurfaceSummaryFindings
// ---------------------------------------------------------------------------

describe("collectAttackSurfaceSummaryFindings", () => {
  it("always returns exactly one info finding", () => {
    const cfg: OpenClawConfig = {};
    const findings = collectAttackSurfaceSummaryFindings(cfg);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("summary.attack_surface");
    expect(findings[0]?.severity).toBe("info");
  });

  it("reflects open group counts in the detail", () => {
    const cfg: OpenClawConfig = {
      channels: {
        telegram: { groupPolicy: "open" },
        discord: { groupPolicy: "open" },
        slack: { groupPolicy: "allowlist" },
      },
    };
    const findings = collectAttackSurfaceSummaryFindings(cfg);
    expect(findings[0]?.detail).toContain("open=2");
    expect(findings[0]?.detail).toContain("allowlist=1");
  });

  it("shows hooks disabled when hooks.enabled is not true", () => {
    const cfg: OpenClawConfig = { hooks: { enabled: false } };
    const findings = collectAttackSurfaceSummaryFindings(cfg);
    expect(findings[0]?.detail).toContain("hooks: disabled");
  });

  it("shows hooks enabled when hooks.enabled is true", () => {
    const cfg: OpenClawConfig = { hooks: { enabled: true } };
    const findings = collectAttackSurfaceSummaryFindings(cfg);
    expect(findings[0]?.detail).toContain("hooks: enabled");
  });
});

// ---------------------------------------------------------------------------
// collectSyncedFolderFindings
// ---------------------------------------------------------------------------

describe("collectSyncedFolderFindings", () => {
  it("returns empty for normal local paths", () => {
    const findings = collectSyncedFolderFindings({
      stateDir: "/home/user/.openclaw",
      configPath: "/home/user/.openclaw/config.json",
    });
    expect(findings).toHaveLength(0);
  });

  it("flags an iCloud state dir", () => {
    const findings = collectSyncedFolderFindings({
      stateDir: "/Users/alice/iCloud Drive/.openclaw",
      configPath: "/home/user/.openclaw/config.json",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("fs.synced_dir");
    expect(findings[0]?.severity).toBe("warn");
  });

  it("flags a Dropbox config path", () => {
    const findings = collectSyncedFolderFindings({
      stateDir: "/home/user/.openclaw",
      configPath: "/home/user/Dropbox/.openclaw/config.json",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("fs.synced_dir");
  });

  it("flags an OneDrive state dir (case-insensitive)", () => {
    const findings = collectSyncedFolderFindings({
      stateDir: "C:\\Users\\bob\\OneDrive\\.openclaw",
      configPath: "C:\\Users\\bob\\config.json",
    });
    expect(findings).toHaveLength(1);
  });

  it("flags a Google Drive path", () => {
    const findings = collectSyncedFolderFindings({
      stateDir: "/Users/alice/Google Drive/.openclaw",
      configPath: "/home/user/config.json",
    });
    expect(findings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// collectSecretsInConfigFindings
// ---------------------------------------------------------------------------

describe("collectSecretsInConfigFindings", () => {
  it("returns empty when no secrets are configured", () => {
    const findings = collectSecretsInConfigFindings({});
    expect(findings).toHaveLength(0);
  });

  it("flags a plain-text gateway password", () => {
    const cfg: OpenClawConfig = {
      gateway: { auth: { password: "supersecret" } },
    };
    const findings = collectSecretsInConfigFindings(cfg);
    expect(findings.some((f) => f.checkId === "config.secrets.gateway_password_in_config")).toBe(
      true,
    );
  });

  it("does not flag an env-ref gateway password", () => {
    const cfg: OpenClawConfig = {
      gateway: { auth: { password: "${OPENCLAW_GATEWAY_PASSWORD}" } },
    };
    const findings = collectSecretsInConfigFindings(cfg);
    expect(findings.some((f) => f.checkId === "config.secrets.gateway_password_in_config")).toBe(
      false,
    );
  });

  it("flags a plain-text hooks token when hooks are enabled", () => {
    const cfg: OpenClawConfig = {
      hooks: { enabled: true, token: "myhookstoken12345" },
    };
    const findings = collectSecretsInConfigFindings(cfg);
    expect(findings.some((f) => f.checkId === "config.secrets.hooks_token_in_config")).toBe(true);
  });

  it("does not flag a hooks token when hooks are disabled", () => {
    const cfg: OpenClawConfig = {
      hooks: { enabled: false, token: "myhookstoken12345" },
    };
    const findings = collectSecretsInConfigFindings(cfg);
    expect(findings.some((f) => f.checkId === "config.secrets.hooks_token_in_config")).toBe(false);
  });

  it("does not flag an env-ref hooks token", () => {
    const cfg: OpenClawConfig = {
      hooks: { enabled: true, token: "${HOOKS_TOKEN}" },
    };
    const findings = collectSecretsInConfigFindings(cfg);
    expect(findings.some((f) => f.checkId === "config.secrets.hooks_token_in_config")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// collectHooksHardeningFindings
// ---------------------------------------------------------------------------

describe("collectHooksHardeningFindings", () => {
  it("returns empty when hooks are disabled", () => {
    const cfg: OpenClawConfig = { hooks: { enabled: false } };
    expect(collectHooksHardeningFindings(cfg)).toHaveLength(0);
  });

  it("returns empty for a hardened hooks config", () => {
    const cfg: OpenClawConfig = {
      hooks: {
        enabled: true,
        token: "this-is-a-long-secure-token-abc123",
        path: "/hooks",
      },
    };
    const findings = collectHooksHardeningFindings(cfg);
    expect(findings.every((f) => f.checkId !== "hooks.token_too_short")).toBe(true);
    expect(findings.every((f) => f.checkId !== "hooks.path_root")).toBe(true);
  });

  it("flags a hooks path of '/'", () => {
    const cfg: OpenClawConfig = {
      hooks: { enabled: true, token: "long-enough-token-here-ok", path: "/" },
    };
    const findings = collectHooksHardeningFindings(cfg);
    expect(findings.some((f) => f.checkId === "hooks.path_root")).toBe(true);
    expect(findings.find((f) => f.checkId === "hooks.path_root")?.severity).toBe("critical");
  });

  it("flags a hooks token shorter than 24 chars", () => {
    const cfg: OpenClawConfig = {
      hooks: { enabled: true, token: "short", path: "/hooks" },
    };
    const findings = collectHooksHardeningFindings(cfg);
    expect(findings.some((f) => f.checkId === "hooks.token_too_short")).toBe(true);
    expect(findings.find((f) => f.checkId === "hooks.token_too_short")?.severity).toBe("warn");
  });

  it("flags token reuse when hooks token matches gateway token", () => {
    const sharedToken = "shared-token-that-is-long-enough-ok";
    const cfg: OpenClawConfig = {
      hooks: { enabled: true, token: sharedToken, path: "/hooks" },
      gateway: { auth: { token: sharedToken } },
    };
    const findings = collectHooksHardeningFindings(cfg);
    expect(findings.some((f) => f.checkId === "hooks.token_reuse_gateway_token")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// collectModelHygieneFindings
// ---------------------------------------------------------------------------

describe("collectModelHygieneFindings", () => {
  it("returns empty when no models are configured", () => {
    const findings = collectModelHygieneFindings({});
    expect(findings).toHaveLength(0);
  });

  it("flags a GPT-3.5 model as legacy", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { model: { primary: "gpt-3.5-turbo" } } },
    };
    const findings = collectModelHygieneFindings(cfg);
    expect(findings.some((f) => f.checkId === "models.legacy")).toBe(true);
  });

  it("flags a Claude-2 model as legacy", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { model: { primary: "claude-2" } } },
    };
    const findings = collectModelHygieneFindings(cfg);
    expect(findings.some((f) => f.checkId === "models.legacy")).toBe(true);
  });

  it("flags a haiku model as below recommended tier", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { model: { primary: "claude-haiku-3" } } },
    };
    const findings = collectModelHygieneFindings(cfg);
    expect(findings.some((f) => f.checkId === "models.weak_tier")).toBe(true);
  });

  it("flags a GPT-4 model as below GPT-5 tier", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { model: { primary: "gpt-4-turbo" } } },
    };
    const findings = collectModelHygieneFindings(cfg);
    expect(findings.some((f) => f.checkId === "models.weak_tier")).toBe(true);
  });

  it("does not flag a GPT-5 model", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { model: { primary: "gpt-5" } } },
    };
    const findings = collectModelHygieneFindings(cfg);
    expect(findings.some((f) => f.checkId === "models.weak_tier")).toBe(false);
    expect(findings.some((f) => f.checkId === "models.legacy")).toBe(false);
  });

  it("does not flag a claude-sonnet-4-5 model", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { model: { primary: "claude-sonnet-4-5" } } },
    };
    const findings = collectModelHygieneFindings(cfg);
    expect(findings.some((f) => f.checkId === "models.legacy")).toBe(false);
    expect(findings.some((f) => f.checkId === "models.weak_tier")).toBe(false);
  });

  it("checks fallback model list as well", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          model: {
            primary: "gpt-5",
            fallbacks: ["gpt-3.5-turbo"],
          },
        },
      },
    };
    const findings = collectModelHygieneFindings(cfg);
    expect(findings.some((f) => f.checkId === "models.legacy")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// collectSmallModelRiskFindings
// ---------------------------------------------------------------------------

describe("collectSmallModelRiskFindings", () => {
  it("returns empty when no models are configured", () => {
    const findings = collectSmallModelRiskFindings({ cfg: {}, env: {} });
    expect(findings).toHaveLength(0);
  });

  it("returns empty when model has no parameter-count in name", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { model: { primary: "gpt-5" } } },
    };
    const findings = collectSmallModelRiskFindings({ cfg, env: {} });
    expect(findings).toHaveLength(0);
  });

  it("flags a small model without sandboxing as critical", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { model: { primary: "llama-7b" } } },
    };
    const findings = collectSmallModelRiskFindings({ cfg, env: {} });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("models.small_params");
    expect(findings[0]?.severity).toBe("critical");
  });

  it("produces an info finding for a small model with full sandboxing", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          model: { primary: "llama-7b" },
          sandbox: { mode: "all" },
        },
        sandbox: { mode: "all" },
      },
      tools: { deny: ["group:web", "browser"] },
    };
    const findings = collectSmallModelRiskFindings({ cfg, env: {} });
    expect(findings).toHaveLength(1);
    // When sandboxed and no web tools are exposed the severity should be info
    expect(findings[0]?.severity).toBe("info");
  });
});

// ---------------------------------------------------------------------------
// collectExposureMatrixFindings
// ---------------------------------------------------------------------------

describe("collectExposureMatrixFindings", () => {
  it("returns empty when no channels have open groupPolicy", () => {
    const cfg: OpenClawConfig = {
      channels: { telegram: { groupPolicy: "allowlist" } },
      tools: { elevated: { enabled: true } },
    };
    expect(collectExposureMatrixFindings(cfg)).toHaveLength(0);
  });

  it("returns empty when channels is absent", () => {
    const cfg: OpenClawConfig = { tools: { elevated: { enabled: true } } };
    expect(collectExposureMatrixFindings(cfg)).toHaveLength(0);
  });

  it("flags open groupPolicy combined with elevated tools as critical", () => {
    const cfg: OpenClawConfig = {
      channels: { telegram: { groupPolicy: "open" } },
      tools: { elevated: { enabled: true } },
    };
    const findings = collectExposureMatrixFindings(cfg);
    expect(findings.some((f) => f.checkId === "security.exposure.open_groups_with_elevated")).toBe(
      true,
    );
    expect(
      findings.find((f) => f.checkId === "security.exposure.open_groups_with_elevated")?.severity,
    ).toBe("critical");
  });

  it("does not flag open groupPolicy when elevated is disabled", () => {
    const cfg: OpenClawConfig = {
      channels: { telegram: { groupPolicy: "open" } },
      tools: { elevated: { enabled: false } },
    };
    const findings = collectExposureMatrixFindings(cfg);
    expect(findings.some((f) => f.checkId === "security.exposure.open_groups_with_elevated")).toBe(
      false,
    );
  });

  it("flags open groupPolicy inside a channel account", () => {
    const cfg: OpenClawConfig = {
      channels: {
        telegram: {
          groupPolicy: "allowlist",
          accounts: {
            main: { groupPolicy: "open" },
          },
        },
      },
      tools: { elevated: { enabled: true } },
    };
    const findings = collectExposureMatrixFindings(cfg);
    expect(findings.some((f) => f.checkId === "security.exposure.open_groups_with_elevated")).toBe(
      true,
    );
    const detail = findings.find(
      (f) => f.checkId === "security.exposure.open_groups_with_elevated",
    )?.detail;
    expect(detail).toContain("accounts.main.groupPolicy");
  });
});
