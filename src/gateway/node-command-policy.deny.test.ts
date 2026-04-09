import { describe, expect, test } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { resolveNodeCommandAllowlist, isNodeCommandAllowed } from "./node-command-policy.js";

function makeConfig(overrides?: {
  allowCommands?: string[];
  denyCommands?: string[];
}): OpenClawConfig {
  return {
    gateway: {
      nodes: {
        allowCommands: overrides?.allowCommands ?? [],
        denyCommands: overrides?.denyCommands ?? [],
      },
    },
  } as OpenClawConfig;
}

describe("denyCommands precedence", () => {
  test("deny removes commands from platform defaults", () => {
    const cfg = makeConfig({ denyCommands: ["canvas.present"] });
    const allowlist = resolveNodeCommandAllowlist(cfg, { platform: "ios", deviceFamily: "" });
    expect(allowlist.has("canvas.present")).toBe(false);
    // Other canvas commands still allowed
    expect(allowlist.has("canvas.hide")).toBe(true);
  });

  test("deny removes commands added via allowCommands", () => {
    const cfg = makeConfig({
      allowCommands: ["system.run"],
      denyCommands: ["system.run"],
    });
    const allowlist = resolveNodeCommandAllowlist(cfg, { platform: "macos", deviceFamily: "" });
    expect(allowlist.has("system.run")).toBe(false);
  });

  test("deny has no exceptions — even safe commands can be denied", () => {
    const cfg = makeConfig({ denyCommands: ["system.notify"] });
    const allowlist = resolveNodeCommandAllowlist(cfg, { platform: "macos", deviceFamily: "" });
    expect(allowlist.has("system.notify")).toBe(false);
  });

  test("deny applied before isNodeCommandAllowed check", () => {
    const cfg = makeConfig({
      allowCommands: ["system.run"],
      denyCommands: ["system.run"],
    });
    const allowlist = resolveNodeCommandAllowlist(cfg, { platform: "macos", deviceFamily: "" });
    const result = isNodeCommandAllowed({
      command: "system.run",
      declaredCommands: ["system.run"],
      allowlist,
    });
    expect(result.ok).toBe(false);
  });

  test("empty deny list does not affect allowlist", () => {
    const cfg = makeConfig({ denyCommands: [] });
    const allowlist = resolveNodeCommandAllowlist(cfg, { platform: "macos", deviceFamily: "" });
    // system.notify should still be present from macos defaults
    expect(allowlist.has("system.notify")).toBe(true);
  });

  test("multiple deny entries all take effect", () => {
    const cfg = makeConfig({
      denyCommands: ["canvas.present", "canvas.hide", "canvas.navigate"],
    });
    const allowlist = resolveNodeCommandAllowlist(cfg, { platform: "ios", deviceFamily: "" });
    expect(allowlist.has("canvas.present")).toBe(false);
    expect(allowlist.has("canvas.hide")).toBe(false);
    expect(allowlist.has("canvas.navigate")).toBe(false);
    // Others unaffected
    expect(allowlist.has("canvas.eval")).toBe(true);
  });
});
