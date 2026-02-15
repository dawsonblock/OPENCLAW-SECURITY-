import { describe, expect, it } from "vitest";
import {
  DEFAULT_SANDBOX_IMAGE,
  DEFAULT_SANDBOX_WORKDIR,
  DEFAULT_SANDBOX_CONTAINER_PREFIX,
} from "./constants.js";
import { buildSandboxCreateArgs } from "./docker.js";

describe("buildSandboxCreateArgs", () => {
  const baseConfig = {
    image: DEFAULT_SANDBOX_IMAGE,
    containerPrefix: DEFAULT_SANDBOX_CONTAINER_PREFIX,
    workdir: DEFAULT_SANDBOX_WORKDIR,
    readOnlyRoot: true,
    tmpfs: [],
    user: "root",
    capDrop: ["ALL"],
    env: {},
    pidsLimit: 100,
    network: "none", // Default secure
  };

  it("enforces network isolation", () => {
    const args = buildSandboxCreateArgs({
      name: "test-sandbox",
      cfg: {
        ...baseConfig,
        network: "none",
      },
      scopeKey: "test-scope",
    });

    expect(args).toContain("--network");
    const idx = args.indexOf("--network");
    expect(args[idx + 1]).toBe("none");
  });

  it("drops all capabilities by default", () => {
    const args = buildSandboxCreateArgs({
      name: "test-sandbox",
      cfg: {
        ...baseConfig,
        capDrop: ["ALL"],
      },
      scopeKey: "test-scope",
    });

    expect(args).toContain("--cap-drop");
    const idx = args.indexOf("--cap-drop");
    expect(args[idx + 1]).toBe("ALL");
  });

  it("applies memory and cpu limits", () => {
    const args = buildSandboxCreateArgs({
      name: "test-sandbox",
      cfg: {
        ...baseConfig,
        memory: "512m",
        cpus: 1.5,
      },
      scopeKey: "test-scope",
    });

    expect(args).toContain("--memory");
    expect(args[args.indexOf("--memory") + 1]).toBe("512m");

    expect(args).toContain("--cpus");
    expect(args[args.indexOf("--cpus") + 1]).toBe("1.5");
  });

  it("enforces no-new-privileges", () => {
    const args = buildSandboxCreateArgs({
      name: "test-sandbox",
      cfg: baseConfig,
      scopeKey: "test-scope",
    });

    expect(args).toContain("--security-opt");
    expect(args).toContain("no-new-privileges:true");
  });
});
