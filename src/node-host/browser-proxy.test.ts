import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getMediaDir } from "../media/store.js";
import { readBrowserProxyFile } from "./browser-proxy.js";

const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-browser-proxy-test-"));
  tmpDirs.push(dir);
  return dir;
}

async function withStateDir<T>(stateDir: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = stateDir;
  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previous;
    }
  }
}

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  tmpDirs.length = 0;
});

describe("readBrowserProxyFile", () => {
  it("allows files inside the media directory", async () => {
    const stateDir = await makeTmpDir();
    await withStateDir(stateDir, async () => {
      const mediaDir = getMediaDir();
      await fs.mkdir(mediaDir, { recursive: true });
      const filePath = path.join(mediaDir, "image.txt");
      await fs.writeFile(filePath, "hello media", "utf8");

      const file = await readBrowserProxyFile(filePath);
      expect(file?.path).toBe(filePath);
      expect(Buffer.from(file?.base64 ?? "", "base64").toString("utf8")).toBe("hello media");
    });
  });

  it("allows files inside /tmp/openclaw/downloads", async () => {
    const downloadsDir = "/tmp/openclaw/downloads";
    await fs.mkdir(downloadsDir, { recursive: true });
    const filePath = path.join(downloadsDir, `download-${Date.now()}.txt`);
    await fs.writeFile(filePath, "hello download", "utf8");

    const file = await readBrowserProxyFile(filePath);
    expect(file?.path).toBe(filePath);
    expect(Buffer.from(file?.base64 ?? "", "base64").toString("utf8")).toBe("hello download");

    await fs.rm(filePath, { force: true });
  });

  it("rejects outside-root paths", async () => {
    const outsideDir = await makeTmpDir();
    const outsidePath = path.join(outsideDir, "outside.txt");
    await fs.writeFile(outsidePath, "outside", "utf8");

    await expect(readBrowserProxyFile(outsidePath)).rejects.toThrow(
      "browser proxy file path is outside approved roots",
    );
  });

  it("rejects symlink escapes from an allowed root", async () => {
    const stateDir = await makeTmpDir();
    const outsideDir = await makeTmpDir();
    const outsidePath = path.join(outsideDir, "outside.txt");
    await fs.writeFile(outsidePath, "outside", "utf8");

    await withStateDir(stateDir, async () => {
      const mediaDir = getMediaDir();
      await fs.mkdir(mediaDir, { recursive: true });
      const symlinkPath = path.join(mediaDir, "escape.txt");
      await fs.symlink(outsidePath, symlinkPath);

      await expect(readBrowserProxyFile(symlinkPath)).rejects.toThrow(
        "browser proxy file path is outside approved roots",
      );
    });
  });
});
