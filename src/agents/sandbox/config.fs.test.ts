import { describe, it, expect } from "vitest";
import { resolveSandboxDockerConfig } from "./config.js";

describe("Sandbox Filesystem Jail", () => {
  it("allows binds when no whitelist is present (default behavior, pending confirm)", () => {
    // Current implementation: if fsAllow is undefined, binds are passed through.
    // Wait, step 1269: "if (!allow && binds.length > 0) throw Error"
    // So if no whitelist, NO BINDS ALLOWED.
    expect(() => {
      resolveSandboxDockerConfig({
        scope: "agent",
        globalDocker: { binds: ["/tmp:/tmp"] },
      });
    }).toThrow(/Sandbox binds are not allowed unless whitelisted/);
  });

  it("allows binds that are in the whitelist", () => {
    const config = resolveSandboxDockerConfig({
      scope: "agent",
      globalDocker: { binds: ["/tmp/foo:/tmp/foo"] },
      fsAllow: ["/tmp"],
    });
    expect(config.binds).toEqual(["/tmp/foo:/tmp/foo"]);
  });

  it("allows binds that match the whitelist exactly", () => {
    const config = resolveSandboxDockerConfig({
      scope: "agent",
      globalDocker: { binds: ["/tmp:/tmp"] },
      fsAllow: ["/tmp"],
    });
    expect(config.binds).toEqual(["/tmp:/tmp"]);
  });

  it("rejects binds not in whitelist", () => {
    expect(() => {
      resolveSandboxDockerConfig({
        scope: "agent",
        globalDocker: { binds: ["/etc/passwd:/etc/passwd"] },
        fsAllow: ["/tmp"],
      });
    }).toThrow(/not in 'fs.allow' whitelist/);
  });

  it("rejects binds that are strictly not subpaths", () => {
    // /tmp-foo is not inside /tmp
    expect(() => {
      resolveSandboxDockerConfig({
        scope: "agent",
        globalDocker: { binds: ["/tmp-foo:/tmp/foo"] },
        fsAllow: ["/tmp"],
      });
    }).toThrow(/not in 'fs.allow' whitelist/);
  });
});
