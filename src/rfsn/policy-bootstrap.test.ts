import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { bootstrapRfsnPolicy, createAndBootstrapDefaultPolicy } from "./policy-bootstrap.js";
import { createDefaultRfsnPolicy } from "./policy.js";

async function createTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "openclaw-rfsn-policy-"));
}

async function writeSignedPolicyFile(params: {
  dir: string;
  fileName: string;
  payload: unknown;
}): Promise<{ policyPath: string; publicKeyPem: string }> {
  const policyPath = path.join(params.dir, params.fileName);
  const bytes = Buffer.from(JSON.stringify(params.payload), "utf8");
  await fs.writeFile(policyPath, bytes);

  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const sign = crypto.createSign("sha256");
  sign.update(bytes);
  sign.end();
  const signature = sign.sign(privateKey).toString("base64");
  await fs.writeFile(`${policyPath}.sig`, `${signature}\n`, "utf8");

  const publicKeyPem = publicKey.export({ type: "pkcs1", format: "pem" }).toString("utf8");
  return { policyPath, publicKeyPem };
}

describe("bootstrapRfsnPolicy", () => {
  test("returns base policy when no policy file is configured", () => {
    const basePolicy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["read", "write"],
    });

    const boot = bootstrapRfsnPolicy({ basePolicy });
    expect(boot.source).toBe("default");
    expect(boot.policy.allowTools.has("read")).toBe(true);
    expect(boot.policy.allowTools.has("write")).toBe(true);
  });

  test("fails closed when verification is enabled without a policy path", () => {
    const basePolicy = createDefaultRfsnPolicy();
    expect(() => bootstrapRfsnPolicy({ basePolicy, verify: true })).toThrow(
      /policy_verify_enabled_but_no_policy_path/,
    );
  });

  test("applies file constraints as strict intersections", async () => {
    const dir = await createTmpDir();
    const policyPath = path.join(dir, "policy.json");
    await fs.writeFile(
      policyPath,
      JSON.stringify({
        allowTools: ["read"],
        grantedCapabilities: ["fs:read:workspace"],
        execSafeBins: ["rg"],
        maxArgsBytes: 2048,
        toolRules: {
          read: { maxArgsBytes: 1024, capabilitiesRequired: ["fs:read:workspace"] },
        },
      }),
      "utf8",
    );

    const basePolicy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["read", "exec"],
      grantedCapabilities: ["proc:manage", "fs:read:workspace"],
      execSafeBins: ["rg", "git"],
      maxArgsBytes: 4096,
    });
    const boot = bootstrapRfsnPolicy({ basePolicy, policyPath });

    expect(boot.source).toBe("file");
    expect(boot.policy.allowTools.has("read")).toBe(true);
    expect(boot.policy.allowTools.has("exec")).toBe(false);
    expect(boot.policy.grantedCapabilities.has("fs:read:workspace")).toBe(true);
    expect(boot.policy.grantedCapabilities.has("proc:manage")).toBe(false);
    expect(boot.policy.execSafeBins.has("rg")).toBe(true);
    expect(boot.policy.execSafeBins.has("git")).toBe(false);
    expect(boot.policy.maxArgsBytes).toBe(2048);
    expect(boot.policy.toolRules.read?.maxArgsBytes).toBe(1024);
  });

  test("verifies detached policy signatures when enabled", async () => {
    const dir = await createTmpDir();
    const { policyPath, publicKeyPem } = await writeSignedPolicyFile({
      dir,
      fileName: "policy.signed.json",
      payload: {
        allowTools: ["read"],
      },
    });

    const basePolicy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["read", "write"],
    });

    const boot = bootstrapRfsnPolicy({
      basePolicy,
      policyPath,
      verify: true,
      publicKeyPem,
    });
    expect(boot.source).toBe("file");
    expect(boot.policy.allowTools.has("read")).toBe(true);
    expect(boot.policy.allowTools.has("write")).toBe(false);
  });

  test("rejects invalid signatures", async () => {
    const dir = await createTmpDir();
    const { policyPath, publicKeyPem } = await writeSignedPolicyFile({
      dir,
      fileName: "policy.invalid.json",
      payload: {
        allowTools: ["read"],
      },
    });
    await fs.writeFile(policyPath, JSON.stringify({ allowTools: ["write"] }), "utf8");

    const basePolicy = createDefaultRfsnPolicy({
      mode: "allowlist",
      allowTools: ["read", "write"],
    });

    expect(() =>
      bootstrapRfsnPolicy({
        basePolicy,
        policyPath,
        verify: true,
        publicKeyPem,
      }),
    ).toThrow(/policy_signature_invalid/);
  });
});

describe("createAndBootstrapDefaultPolicy", () => {
  test("uses environment verification defaults", async () => {
    const dir = await createTmpDir();
    const { policyPath, publicKeyPem } = await writeSignedPolicyFile({
      dir,
      fileName: "policy.env.json",
      payload: {
        allowTools: ["read"],
      },
    });

    const prevPath = process.env.OPENCLAW_POLICY_PATH;
    const prevVerify = process.env.OPENCLAW_VERIFY_POLICY;
    const prevPubKey = process.env.OPENCLAW_POLICY_PUBKEY;

    try {
      process.env.OPENCLAW_POLICY_PATH = policyPath;
      process.env.OPENCLAW_VERIFY_POLICY = "1";
      process.env.OPENCLAW_POLICY_PUBKEY = publicKeyPem;

      const boot = createAndBootstrapDefaultPolicy({
        basePolicyOptions: {
          mode: "allowlist",
          allowTools: ["read", "write"],
        },
      });
      expect(boot.source).toBe("file");
      expect(boot.policy.allowTools.has("read")).toBe(true);
      expect(boot.policy.allowTools.has("write")).toBe(false);
    } finally {
      if (prevPath === undefined) {
        delete process.env.OPENCLAW_POLICY_PATH;
      } else {
        process.env.OPENCLAW_POLICY_PATH = prevPath;
      }
      if (prevVerify === undefined) {
        delete process.env.OPENCLAW_VERIFY_POLICY;
      } else {
        process.env.OPENCLAW_VERIFY_POLICY = prevVerify;
      }
      if (prevPubKey === undefined) {
        delete process.env.OPENCLAW_POLICY_PUBKEY;
      } else {
        process.env.OPENCLAW_POLICY_PUBKEY = prevPubKey;
      }
    }
  });

  test("disables OPENCLAW_RFSN_* env widening when a policy file is present", async () => {
    const dir = await createTmpDir();
    const { policyPath, publicKeyPem } = await writeSignedPolicyFile({
      dir,
      fileName: "policy.no-env-widening.json",
      payload: {
        allowTools: ["read"],
      },
    });

    const prevPolicyPath = process.env.OPENCLAW_POLICY_PATH;
    const prevVerify = process.env.OPENCLAW_VERIFY_POLICY;
    const prevPubKey = process.env.OPENCLAW_POLICY_PUBKEY;
    const prevAllow = process.env.OPENCLAW_RFSN_ALLOW_TOOLS;
    const prevMode = process.env.OPENCLAW_RFSN_MODE;
    try {
      process.env.OPENCLAW_POLICY_PATH = policyPath;
      process.env.OPENCLAW_VERIFY_POLICY = "1";
      process.env.OPENCLAW_POLICY_PUBKEY = publicKeyPem;
      process.env.OPENCLAW_RFSN_ALLOW_TOOLS = "exec,web_fetch";
      process.env.OPENCLAW_RFSN_MODE = "allow_all";

      const boot = createAndBootstrapDefaultPolicy({
        basePolicyOptions: {
          mode: "allowlist",
          allowTools: ["read"],
        },
      });

      expect(boot.policy.mode).toBe("allowlist");
      expect(boot.policy.allowTools.has("read")).toBe(true);
      expect(boot.policy.allowTools.has("exec")).toBe(false);
      expect(boot.policy.allowTools.has("web_fetch")).toBe(false);
    } finally {
      if (prevPolicyPath === undefined) {
        delete process.env.OPENCLAW_POLICY_PATH;
      } else {
        process.env.OPENCLAW_POLICY_PATH = prevPolicyPath;
      }
      if (prevVerify === undefined) {
        delete process.env.OPENCLAW_VERIFY_POLICY;
      } else {
        process.env.OPENCLAW_VERIFY_POLICY = prevVerify;
      }
      if (prevPubKey === undefined) {
        delete process.env.OPENCLAW_POLICY_PUBKEY;
      } else {
        process.env.OPENCLAW_POLICY_PUBKEY = prevPubKey;
      }
      if (prevAllow === undefined) {
        delete process.env.OPENCLAW_RFSN_ALLOW_TOOLS;
      } else {
        process.env.OPENCLAW_RFSN_ALLOW_TOOLS = prevAllow;
      }
      if (prevMode === undefined) {
        delete process.env.OPENCLAW_RFSN_MODE;
      } else {
        process.env.OPENCLAW_RFSN_MODE = prevMode;
      }
    }
  });

  test("fails closed when signed policy mode is required without policy path", () => {
    const prevRequireSigned = process.env.OPENCLAW_RFSN_REQUIRE_SIGNED_POLICY;
    const prevPath = process.env.OPENCLAW_POLICY_PATH;
    const prevPubKey = process.env.OPENCLAW_POLICY_PUBKEY;
    try {
      process.env.OPENCLAW_RFSN_REQUIRE_SIGNED_POLICY = "1";
      delete process.env.OPENCLAW_POLICY_PATH;
      delete process.env.OPENCLAW_POLICY_PUBKEY;
      expect(() =>
        createAndBootstrapDefaultPolicy({
          basePolicyOptions: { mode: "allowlist", allowTools: ["read"] },
        }),
      ).toThrow(/signed_policy_required_but_no_policy_path/);
    } finally {
      if (prevRequireSigned === undefined) {
        delete process.env.OPENCLAW_RFSN_REQUIRE_SIGNED_POLICY;
      } else {
        process.env.OPENCLAW_RFSN_REQUIRE_SIGNED_POLICY = prevRequireSigned;
      }
      if (prevPath === undefined) {
        delete process.env.OPENCLAW_POLICY_PATH;
      } else {
        process.env.OPENCLAW_POLICY_PATH = prevPath;
      }
      if (prevPubKey === undefined) {
        delete process.env.OPENCLAW_POLICY_PUBKEY;
      } else {
        process.env.OPENCLAW_POLICY_PUBKEY = prevPubKey;
      }
    }
  });

  test("signed policy mode implies verification even when OPENCLAW_VERIFY_POLICY is unset", async () => {
    const dir = await createTmpDir();
    const { policyPath, publicKeyPem } = await writeSignedPolicyFile({
      dir,
      fileName: "policy.require-signed.json",
      payload: { allowTools: ["read"] },
    });

    const prevRequireSigned = process.env.OPENCLAW_RFSN_REQUIRE_SIGNED_POLICY;
    const prevVerify = process.env.OPENCLAW_VERIFY_POLICY;
    const prevPath = process.env.OPENCLAW_POLICY_PATH;
    const prevPubKey = process.env.OPENCLAW_POLICY_PUBKEY;

    try {
      process.env.OPENCLAW_RFSN_REQUIRE_SIGNED_POLICY = "1";
      delete process.env.OPENCLAW_VERIFY_POLICY;
      process.env.OPENCLAW_POLICY_PATH = policyPath;
      process.env.OPENCLAW_POLICY_PUBKEY = publicKeyPem;

      const boot = createAndBootstrapDefaultPolicy({
        basePolicyOptions: { mode: "allowlist", allowTools: ["read", "write"] },
      });

      expect(boot.source).toBe("file");
      expect(boot.policy.allowTools.has("read")).toBe(true);
      expect(boot.policy.allowTools.has("write")).toBe(false);
    } finally {
      if (prevRequireSigned === undefined) {
        delete process.env.OPENCLAW_RFSN_REQUIRE_SIGNED_POLICY;
      } else {
        process.env.OPENCLAW_RFSN_REQUIRE_SIGNED_POLICY = prevRequireSigned;
      }
      if (prevVerify === undefined) {
        delete process.env.OPENCLAW_VERIFY_POLICY;
      } else {
        process.env.OPENCLAW_VERIFY_POLICY = prevVerify;
      }
      if (prevPath === undefined) {
        delete process.env.OPENCLAW_POLICY_PATH;
      } else {
        process.env.OPENCLAW_POLICY_PATH = prevPath;
      }
      if (prevPubKey === undefined) {
        delete process.env.OPENCLAW_POLICY_PUBKEY;
      } else {
        process.env.OPENCLAW_POLICY_PUBKEY = prevPubKey;
      }
    }
  });
});
