import JSZip from "jszip";
import fs from "node:fs/promises";
import path from "node:path";
import * as tar from "tar";

export type ArchiveKind = "tar" | "zip";

export type ArchiveLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
};

const TAR_SUFFIXES = [".tgz", ".tar.gz", ".tar"];
const DEFAULT_MAX_ARCHIVE_ENTRIES = 10_000;
const DEFAULT_MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

export function resolveArchiveKind(filePath: string): ArchiveKind | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".zip")) {
    return "zip";
  }
  if (TAR_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
    return "tar";
  }
  return null;
}

export async function resolvePackedRootDir(extractDir: string): Promise<string> {
  const direct = path.join(extractDir, "package");
  try {
    const stat = await fs.stat(direct);
    if (stat.isDirectory()) {
      return direct;
    }
  } catch {
    // ignore
  }

  const entries = await fs.readdir(extractDir, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  if (dirs.length !== 1) {
    throw new Error(`unexpected archive layout (dirs: ${dirs.join(", ")})`);
  }
  const onlyDir = dirs[0];
  if (!onlyDir) {
    throw new Error("unexpected archive layout (no package dir found)");
  }
  return path.join(extractDir, onlyDir);
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function getArchiveLimits(): { maxEntries: number; maxBytes: number } {
  return {
    maxEntries: readPositiveIntEnv("OPENCLAW_ARCHIVE_MAX_ENTRIES", DEFAULT_MAX_ARCHIVE_ENTRIES),
    maxBytes: readPositiveIntEnv("OPENCLAW_ARCHIVE_MAX_BYTES", DEFAULT_MAX_ARCHIVE_BYTES),
  };
}

function normalizeArchiveEntryPath(entryPath: string): string {
  return entryPath.replaceAll("\\", "/").trim();
}

function isUnsafeArchiveEntryPath(entryPath: string): boolean {
  const normalized = normalizeArchiveEntryPath(entryPath);
  if (!normalized) {
    return true;
  }
  if (normalized.includes("\u0000")) {
    return true;
  }
  if (normalized.startsWith("/") || normalized.startsWith("\\")) {
    return true;
  }
  if (/^[a-zA-Z]:\//.test(normalized) || /^[a-zA-Z]:\\/.test(normalized)) {
    return true;
  }
  for (const segment of normalized.split("/")) {
    if (segment === "..") {
      return true;
    }
  }
  return false;
}

function ensurePathWithinRoot(rootDir: string, entryPath: string): string {
  const normalizedRoot = path.resolve(rootDir);
  const outputPath = path.resolve(normalizedRoot, normalizeArchiveEntryPath(entryPath));
  const relative = path.relative(normalizedRoot, outputPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`archive entry escapes destination: ${entryPath}`);
  }
  return outputPath;
}

function isZipSymlink(entry: JSZip.JSZipObject): boolean {
  const rawPerm = entry.unixPermissions;
  const perm =
    typeof rawPerm === "string"
      ? Number.parseInt(rawPerm, 8)
      : typeof rawPerm === "number"
        ? rawPerm
        : undefined;
  if (typeof perm !== "number" || Number.isNaN(perm)) {
    return false;
  }
  return (perm & 0o170000) === 0o120000;
}

async function extractZip(params: { archivePath: string; destDir: string }): Promise<void> {
  const buffer = await fs.readFile(params.archivePath);
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  const limits = getArchiveLimits();
  if (entries.length > limits.maxEntries) {
    throw new Error(`archive has too many entries (${entries.length} > ${limits.maxEntries})`);
  }
  let totalBytes = 0;

  for (const entry of entries) {
    const entryPath = normalizeArchiveEntryPath(entry.name);
    if (isUnsafeArchiveEntryPath(entryPath)) {
      throw new Error(`zip entry escapes destination: ${entry.name}`);
    }
    if (isZipSymlink(entry)) {
      throw new Error(`zip entry is a symbolic link: ${entry.name}`);
    }
    if (!entryPath || entryPath.endsWith("/")) {
      const dirPath = ensurePathWithinRoot(params.destDir, entryPath);
      await fs.mkdir(dirPath, { recursive: true });
      continue;
    }

    const outPath = ensurePathWithinRoot(params.destDir, entryPath);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    const data = await entry.async("nodebuffer");
    totalBytes += data.byteLength;
    if (totalBytes > limits.maxBytes) {
      throw new Error(`archive exceeds size limit (${limits.maxBytes} bytes)`);
    }
    await fs.writeFile(outPath, data);
  }
}

async function inspectTarArchive(params: {
  archivePath: string;
  timeoutMs: number;
}): Promise<void> {
  const limits = getArchiveLimits();
  let entryCount = 0;
  let totalBytes = 0;
  let blockedEntry: string | undefined;

  await withTimeout(
    tar.t({
      file: params.archivePath,
      onentry: (entry) => {
        entryCount += 1;
        if (entryCount > limits.maxEntries) {
          blockedEntry = `archive has too many entries (${entryCount} > ${limits.maxEntries})`;
        }

        if (isUnsafeArchiveEntryPath(entry.path)) {
          blockedEntry = `tar entry escapes destination: ${entry.path}`;
        }

        if (
          entry.type === "SymbolicLink" ||
          entry.type === "Link" ||
          entry.type === "CharacterDevice" ||
          entry.type === "BlockDevice" ||
          entry.type === "FIFO"
        ) {
          blockedEntry = `tar entry type is not allowed: ${entry.path} (${entry.type})`;
        }

        totalBytes += typeof entry.size === "number" ? entry.size : 0;
        if (totalBytes > limits.maxBytes) {
          blockedEntry = `archive exceeds size limit (${limits.maxBytes} bytes)`;
        }

        entry.resume();
      },
    }),
    params.timeoutMs,
    "inspect tar",
  );

  if (blockedEntry) {
    throw new Error(blockedEntry);
  }
}

export async function extractArchive(params: {
  archivePath: string;
  destDir: string;
  timeoutMs: number;
  logger?: ArchiveLogger;
}): Promise<void> {
  const kind = resolveArchiveKind(params.archivePath);
  if (!kind) {
    throw new Error(`unsupported archive: ${params.archivePath}`);
  }

  const label = kind === "zip" ? "extract zip" : "extract tar";
  if (kind === "tar") {
    await inspectTarArchive({ archivePath: params.archivePath, timeoutMs: params.timeoutMs });
    await withTimeout(
      tar.x({ file: params.archivePath, cwd: params.destDir }),
      params.timeoutMs,
      label,
    );
    return;
  }

  await withTimeout(extractZip(params), params.timeoutMs, label);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}
