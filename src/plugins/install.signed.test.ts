import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

const previousRequireSignedPlugins = process.env.OPENCLAW_REQUIRE_SIGNED_PLUGINS;
const previousPluginPubkey = process.env.OPENCLAW_PLUGIN_PUBKEY;

function makeTempDir() {
  const dir = path.join(os.tmpdir(), `openclaw-plugin-signed-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

function signFile(params: { filePath: string; privateKeyPem: string }): string {
  const signer = createSign("RSA-SHA256");
  signer.update(fs.readFileSync(params.filePath));
  signer.end();
  return signer.sign(params.privateKeyPem, "base64");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  if (previousRequireSignedPlugins === undefined) {
    delete process.env.OPENCLAW_REQUIRE_SIGNED_PLUGINS;
  } else {
    process.env.OPENCLAW_REQUIRE_SIGNED_PLUGINS = previousRequireSignedPlugins;
  }
  if (previousPluginPubkey === undefined) {
    delete process.env.OPENCLAW_PLUGIN_PUBKEY;
  } else {
    process.env.OPENCLAW_PLUGIN_PUBKEY = previousPluginPubkey;
  }
});

describe("signed plugin install enforcement", () => {
  it("requires plugin public key when signed mode is enabled", async () => {
    process.env.OPENCLAW_REQUIRE_SIGNED_PLUGINS = "1";
    delete process.env.OPENCLAW_PLUGIN_PUBKEY;

    const stateDir = makeTempDir();
    const srcFile = path.join(makeTempDir(), "plugin.js");
    fs.writeFileSync(srcFile, "export default {};\n", "utf8");

    const { installPluginFromFile } = await import("./install.js");
    const result = await installPluginFromFile({
      filePath: srcFile,
      extensionsDir: path.join(stateDir, "extensions"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain("OPENCLAW_PLUGIN_PUBKEY");
  });

  it("rejects unsigned directory installs when signed mode is enabled", async () => {
    process.env.OPENCLAW_REQUIRE_SIGNED_PLUGINS = "1";
    process.env.OPENCLAW_PLUGIN_PUBKEY = "test";

    const stateDir = makeTempDir();
    const srcDir = makeTempDir();
    fs.writeFileSync(path.join(srcDir, "package.json"), "{}", "utf8");

    const { installPluginFromDir } = await import("./install.js");
    const result = await installPluginFromDir({
      dirPath: srcDir,
      extensionsDir: path.join(stateDir, "extensions"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain("signed plugin mode does not support directory installs");
  });

  it("accepts signed file installs when signature verifies", async () => {
    process.env.OPENCLAW_REQUIRE_SIGNED_PLUGINS = "1";

    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs1" }).toString();
    const publicKeyPem = publicKey.export({ format: "pem", type: "pkcs1" }).toString();
    process.env.OPENCLAW_PLUGIN_PUBKEY = publicKeyPem;

    const stateDir = makeTempDir();
    const srcFile = path.join(makeTempDir(), "plugin.js");
    fs.writeFileSync(srcFile, "export default { hello: true };\n", "utf8");
    const sig = signFile({ filePath: srcFile, privateKeyPem });
    fs.writeFileSync(`${srcFile}.sig`, `${sig}\n`, "utf8");

    const { installPluginFromFile } = await import("./install.js");
    const result = await installPluginFromFile({
      filePath: srcFile,
      extensionsDir: path.join(stateDir, "extensions"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(fs.existsSync(result.targetDir)).toBe(true);
  });
});
