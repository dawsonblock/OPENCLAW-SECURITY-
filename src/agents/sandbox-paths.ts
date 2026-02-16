import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePathWithinRoot } from "../infra/fs-safe.js";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const HTTP_URL_RE = /^https?:\/\//i;
const DATA_URL_RE = /^data:/i;

function normalizeUnicodeSpaces(str: string): string {
  return str.replace(UNICODE_SPACES, " ");
}

function expandPath(filePath: string): string {
  const normalized = normalizeUnicodeSpaces(filePath);
  if (normalized === "~") {
    return os.homedir();
  }
  if (normalized.startsWith("~/")) {
    return os.homedir() + normalized.slice(1);
  }
  return normalized;
}

export async function resolveSandboxPath(params: {
  filePath: string;
  cwd: string;
  root: string;
}): Promise<{
  resolved: string;
  relative: string;
  rootReal: string;
}> {
  const expanded = expandPath(params.filePath);
  // Resolve against CWD first to handle relative paths
  const candidate = path.resolve(params.cwd, expanded);

  // Use fs-safe logic to validate containment within root
  const { resolved, rootReal } = await validatePathWithinRoot({
    rootDir: params.root,
    relativePath: candidate,
    // We allow non-existent because this function is used for write/create paths too,
    // but the containment check still applies.
    allowNonExistent: true,
  });

  const relative = path.relative(rootReal, resolved);
  return { resolved, relative, rootReal };
}

export async function assertSandboxPath(params: { filePath: string; cwd: string; root: string }) {
  const resolved = await resolveSandboxPath(params);
  await assertNoSymlink(resolved.relative, resolved.rootReal);
  return resolved;
}

export function assertMediaNotDataUrl(media: string): void {
  const raw = media.trim();
  if (DATA_URL_RE.test(raw)) {
    throw new Error("data: URLs are not supported for media. Use buffer instead.");
  }
}

export async function resolveSandboxedMediaSource(params: {
  media: string;
  sandboxRoot: string;
}): Promise<string> {
  const raw = params.media.trim();
  if (!raw) {
    return raw;
  }
  if (HTTP_URL_RE.test(raw)) {
    return raw;
  }
  let candidate = raw;
  if (/^file:\/\//i.test(candidate)) {
    try {
      candidate = fileURLToPath(candidate);
    } catch {
      throw new Error(`Invalid file:// URL for sandboxed media: ${raw}`);
    }
  }
  const resolved = await assertSandboxPath({
    filePath: candidate,
    cwd: params.sandboxRoot,
    root: params.sandboxRoot,
  });
  return resolved.resolved;
}

async function assertNoSymlink(relative: string, root: string) {
  if (!relative) {
    return;
  }
  const parts = relative.split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`Symlink not allowed in sandbox path: ${current}`);
      }
    } catch (err) {
      const anyErr = err as { code?: string };
      if (anyErr.code === "ENOENT") {
        return;
      }
      throw err;
    }
  }
}
