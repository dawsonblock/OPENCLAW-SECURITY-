import { describe, expect, it } from "vitest";
import { sanitizeExecEnv, isArbitraryEnvAllowed, getSafeEnvKeys } from "./exec-env-allowlist.js";

describe("sanitizeExecEnv", () => {
  it("allows safe env keys through", () => {
    const result = sanitizeExecEnv({ PATH: "/usr/bin", HOME: "/home/user" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env).toEqual({ PATH: "/usr/bin", HOME: "/home/user" });
    }
  });

  it("strips non-safe keys by default", () => {
    const result = sanitizeExecEnv({
      PATH: "/usr/bin",
      OPENAI_API_KEY: "sk-12345",
      SECRET_TOKEN: "abc",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.deniedKeys).toContain("OPENAI_API_KEY");
      expect(result.deniedKeys).toContain("SECRET_TOKEN");
    }
  });

  it("passes all keys with allowArbitraryEnv", () => {
    const result = sanitizeExecEnv(
      { PATH: "/usr/bin", OPENAI_API_KEY: "sk-12345" },
      { allowArbitraryEnv: true },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.OPENAI_API_KEY).toBe("sk-12345");
    }
  });

  it("returns ok for empty or undefined env", () => {
    expect(sanitizeExecEnv(undefined).ok).toBe(true);
    expect(sanitizeExecEnv({}).ok).toBe(true);
  });
});

describe("isArbitraryEnvAllowed", () => {
  it("returns true for 1", () => {
    expect(isArbitraryEnvAllowed({ OPENCLAW_ALLOW_ARBITRARY_ENV: "1" } as NodeJS.ProcessEnv)).toBe(
      true,
    );
  });

  it("returns false by default", () => {
    expect(isArbitraryEnvAllowed({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("getSafeEnvKeys", () => {
  it("returns a list containing PATH and HOME", () => {
    const keys = getSafeEnvKeys();
    expect(keys).toContain("PATH");
    expect(keys).toContain("HOME");
  });
});
