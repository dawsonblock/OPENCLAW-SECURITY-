import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureMediaDir } from "../media/store.js";
import { isAllowedBrowserProxyPath, readBrowserProxyFile } from "./browser-proxy.js";

/**
 * Runtime integration proof for browser-proxy containment through the actual
 * file-reading boundary, not synthetic path math.
 */
describe("browser-containment enforcement (runtime integration)", () => {
  let tempDir = "";
  let allowedDir = "";
  let allowedFile = "";
  let outsideFile = "";
  let escapeSymlink = "";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-browser-containment-"));
    const mediaDir = await ensureMediaDir();
    allowedDir = path.join(mediaDir, `runtime-proof-${Date.now()}`);

    await fs.mkdir(allowedDir, { recursive: true });
    await fs.mkdir(path.join(os.tmpdir(), "openclaw", "downloads"), { recursive: true });

    allowedFile = path.join(allowedDir, "tab-001.json");
    outsideFile = path.join(tempDir, "outside-root.txt");
    escapeSymlink = path.join(allowedDir, "escape-link.txt");

    await fs.writeFile(allowedFile, JSON.stringify({ ok: true }), "utf8");
    await fs.writeFile(outsideFile, "secret-outside-root", "utf8");
    await fs.symlink(outsideFile, escapeSymlink);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(allowedDir, { recursive: true, force: true }).catch(() => {});
  });

  it("reads an in-root file through the live browser-proxy seam", async () => {
    const result = await readBrowserProxyFile(allowedFile);

    expect(path.basename(result?.path ?? "")).toBe(path.basename(allowedFile));
    expect(Buffer.from(result?.base64 ?? "", "base64").toString("utf8")).toContain('"ok":true');
  });

  it("rejects a realpath escape outside approved roots", async () => {
    await expect(readBrowserProxyFile(escapeSymlink)).rejects.toThrow(/outside approved roots/);
    expect(await isAllowedBrowserProxyPath(outsideFile)).toBe(false);
  });
});
