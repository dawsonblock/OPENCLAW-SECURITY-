import { describe, expect, it } from "vitest";
import { normalizePluginsConfig, resolveEnableState } from "./config-state.js";

describe("normalizePluginsConfig", () => {
  it("uses default memory slot when not specified", () => {
    const result = normalizePluginsConfig({});
    expect(result.slots.memory).toBe("memory-core");
  });

  it("respects explicit memory slot value", () => {
    const result = normalizePluginsConfig({
      slots: { memory: "custom-memory" },
    });
    expect(result.slots.memory).toBe("custom-memory");
  });

  it("disables memory slot when set to 'none'", () => {
    const result = normalizePluginsConfig({
      slots: { memory: "none" },
    });
    expect(result.slots.memory).toBeNull();
  });

  it("disables memory slot when set to 'None' (case insensitive)", () => {
    const result = normalizePluginsConfig({
      slots: { memory: "None" },
    });
    expect(result.slots.memory).toBeNull();
  });

  it("trims whitespace from memory slot value", () => {
    const result = normalizePluginsConfig({
      slots: { memory: "  custom-memory  " },
    });
    expect(result.slots.memory).toBe("custom-memory");
  });

  it("uses default when memory slot is empty string", () => {
    const result = normalizePluginsConfig({
      slots: { memory: "" },
    });
    expect(result.slots.memory).toBe("memory-core");
  });

  it("uses default when memory slot is whitespace only", () => {
    const result = normalizePluginsConfig({
      slots: { memory: "   " },
    });
    expect(result.slots.memory).toBe("memory-core");
  });
});

describe("resolveEnableState", () => {
  it("requires allowlist for non-bundled plugins by default", () => {
    const previousRequire = process.env.OPENCLAW_REQUIRE_PLUGIN_ALLOWLIST;
    const previousAllow = process.env.OPENCLAW_ALLOW_EXTERNAL_PLUGINS_WITHOUT_ALLOWLIST;
    delete process.env.OPENCLAW_REQUIRE_PLUGIN_ALLOWLIST;
    delete process.env.OPENCLAW_ALLOW_EXTERNAL_PLUGINS_WITHOUT_ALLOWLIST;
    try {
      const config = normalizePluginsConfig({});
      const state = resolveEnableState("community-plugin", "external", config);
      expect(state.enabled).toBe(false);
      expect(state.reason).toContain("allowlist required");
    } finally {
      if (previousRequire === undefined) {
        delete process.env.OPENCLAW_REQUIRE_PLUGIN_ALLOWLIST;
      } else {
        process.env.OPENCLAW_REQUIRE_PLUGIN_ALLOWLIST = previousRequire;
      }
      if (previousAllow === undefined) {
        delete process.env.OPENCLAW_ALLOW_EXTERNAL_PLUGINS_WITHOUT_ALLOWLIST;
      } else {
        process.env.OPENCLAW_ALLOW_EXTERNAL_PLUGINS_WITHOUT_ALLOWLIST = previousAllow;
      }
    }
  });

  it("still enables allowlisted non-bundled plugins when allowlist is required", () => {
    const previous = process.env.OPENCLAW_REQUIRE_PLUGIN_ALLOWLIST;
    process.env.OPENCLAW_REQUIRE_PLUGIN_ALLOWLIST = "1";
    try {
      const config = normalizePluginsConfig({
        allow: ["community-plugin"],
      });
      const state = resolveEnableState("community-plugin", "external", config);
      expect(state.enabled).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.OPENCLAW_REQUIRE_PLUGIN_ALLOWLIST;
      } else {
        process.env.OPENCLAW_REQUIRE_PLUGIN_ALLOWLIST = previous;
      }
    }
  });

  it("allows non-bundled plugins without allowlist when explicit insecure override is set", () => {
    const previousRequire = process.env.OPENCLAW_REQUIRE_PLUGIN_ALLOWLIST;
    const previousAllow = process.env.OPENCLAW_ALLOW_EXTERNAL_PLUGINS_WITHOUT_ALLOWLIST;
    delete process.env.OPENCLAW_REQUIRE_PLUGIN_ALLOWLIST;
    process.env.OPENCLAW_ALLOW_EXTERNAL_PLUGINS_WITHOUT_ALLOWLIST = "1";
    try {
      const config = normalizePluginsConfig({});
      const state = resolveEnableState("community-plugin", "external", config);
      expect(state.enabled).toBe(true);
    } finally {
      if (previousRequire === undefined) {
        delete process.env.OPENCLAW_REQUIRE_PLUGIN_ALLOWLIST;
      } else {
        process.env.OPENCLAW_REQUIRE_PLUGIN_ALLOWLIST = previousRequire;
      }
      if (previousAllow === undefined) {
        delete process.env.OPENCLAW_ALLOW_EXTERNAL_PLUGINS_WITHOUT_ALLOWLIST;
      } else {
        process.env.OPENCLAW_ALLOW_EXTERNAL_PLUGINS_WITHOUT_ALLOWLIST = previousAllow;
      }
    }
  });
});
