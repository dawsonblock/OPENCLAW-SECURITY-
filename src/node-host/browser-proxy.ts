import fsPromises from "node:fs/promises";
import path from "node:path";
import type { BrowserProxyFile } from "./types.js";
import { resolveBrowserConfig } from "../browser/config.js";
import {
  createBrowserControlContext,
  startBrowserControlServiceFromConfig,
} from "../browser/control-service.js";
import { createBrowserRouteDispatcher } from "../browser/routes/dispatcher.js";
import { loadConfig } from "../config/config.js";
import { detectMime } from "../media/mime.js";
import { getMediaDir } from "../media/store.js";
import { getSecurityEventEmitter } from "../security/security-events-emit.js";
import { BROWSER_PROXY_MAX_FILE_BYTES } from "./types.js";

const BROWSER_PROXY_DOWNLOADS_ROOT = "/tmp/openclaw/downloads";
const browserProxySecurityEmitter = getSecurityEventEmitter().child({ surface: "browser-proxy" });

export function normalizeProfileAllowlist(raw?: string[]): string[] {
  return Array.isArray(raw) ? raw.map((entry) => entry.trim()).filter(Boolean) : [];
}

export function resolveBrowserProxyConfig() {
  const cfg = loadConfig();
  const proxy = cfg.nodeHost?.browserProxy;
  const allowProfiles = normalizeProfileAllowlist(proxy?.allowProfiles);
  const enabled = proxy?.enabled !== false;
  return { enabled, allowProfiles };
}

let browserControlReady: Promise<void> | null = null;

export async function ensureBrowserControlService(): Promise<void> {
  if (browserControlReady) {
    return browserControlReady;
  }
  browserControlReady = (async () => {
    const cfg = loadConfig();
    const resolved = resolveBrowserConfig(cfg.browser, cfg);
    if (!resolved.enabled) {
      throw new Error("browser control disabled");
    }
    const started = await startBrowserControlServiceFromConfig();
    if (!started) {
      throw new Error("browser control disabled");
    }
  })();
  return browserControlReady;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs?: number,
  label?: string,
): Promise<T> {
  const resolved =
    typeof timeoutMs === "number" && Number.isFinite(timeoutMs)
      ? Math.max(1, Math.floor(timeoutMs))
      : undefined;
  if (!resolved) {
    return await promise;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label ?? "request"} timed out`));
    }, resolved);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function isProfileAllowed(params: { allowProfiles: string[]; profile?: string | null }) {
  const { allowProfiles, profile } = params;
  if (!allowProfiles.length) {
    return true;
  }
  if (!profile) {
    return false;
  }
  return allowProfiles.includes(profile.trim());
}

export function collectBrowserProxyPaths(payload: unknown): string[] {
  const paths = new Set<string>();
  const obj =
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null;
  if (!obj) {
    return [];
  }
  if (typeof obj.path === "string" && obj.path.trim()) {
    paths.add(obj.path.trim());
  }
  if (typeof obj.imagePath === "string" && obj.imagePath.trim()) {
    paths.add(obj.imagePath.trim());
  }
  const download = obj.download;
  if (download && typeof download === "object") {
    const dlPath = (download as Record<string, unknown>).path;
    if (typeof dlPath === "string" && dlPath.trim()) {
      paths.add(dlPath.trim());
    }
  }
  return [...paths];
}

export function getAllowedBrowserProxyRoots(): string[] {
  return [getMediaDir(), BROWSER_PROXY_DOWNLOADS_ROOT].map((root) => path.resolve(root));
}

function redactAttemptedBrowserProxyPath(filePath: string): string {
  const fileName = path.basename(filePath);
  return fileName && fileName !== path.sep ? fileName : "<path-redacted>";
}

function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedCandidate = path.resolve(candidatePath);
  if (process.platform === "win32") {
    const rootDrive = path.parse(normalizedRoot).root.toLowerCase();
    const candidateDrive = path.parse(normalizedCandidate).root.toLowerCase();
    if (rootDrive !== candidateDrive) {
      return false;
    }
  }
  const relative = path.relative(normalizedRoot, normalizedCandidate);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

async function resolveAllowedBrowserProxyPath(filePath: string): Promise<string | null> {
  const resolvedFilePath = await fsPromises.realpath(filePath).catch((err: unknown) => {
    if ((err as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return null;
    }
    throw err;
  });
  if (!resolvedFilePath) {
    return null;
  }
  const resolvedRoots = await Promise.all(
    getAllowedBrowserProxyRoots().map(async (root) => {
      try {
        return await fsPromises.realpath(root);
      } catch {
        return null;
      }
    }),
  );
  if (
    !resolvedRoots
      .filter((root): root is string => typeof root === "string")
      .some((root) => isPathWithinRoot(root, resolvedFilePath))
  ) {
    browserProxySecurityEmitter.emit({
      type: "browser-proxy-rejected",
      timestamp: Date.now(),
      level: "warning",
      reason: "outside approved browser proxy roots",
      metadata: {
        attemptedPath: redactAttemptedBrowserProxyPath(filePath),
        approvedRootCount: resolvedRoots.filter((root): root is string => typeof root === "string")
          .length,
      },
    });
    throw new Error(`browser proxy file path is outside approved roots: ${filePath}`);
  }
  return resolvedFilePath;
}

export async function isAllowedBrowserProxyPath(filePath: string): Promise<boolean> {
  try {
    return (await resolveAllowedBrowserProxyPath(filePath)) !== null;
  } catch {
    return false;
  }
}

export async function readBrowserProxyFile(filePath: string): Promise<BrowserProxyFile | null> {
  const allowedPath = await resolveAllowedBrowserProxyPath(filePath);
  if (!allowedPath) {
    return null;
  }
  const stat = await fsPromises.stat(allowedPath).catch(() => null);
  if (!stat || !stat.isFile()) {
    return null;
  }
  if (stat.size > BROWSER_PROXY_MAX_FILE_BYTES) {
    throw new Error(
      `browser proxy file exceeds ${Math.round(BROWSER_PROXY_MAX_FILE_BYTES / (1024 * 1024))}MB`,
    );
  }
  const buffer = await fsPromises.readFile(allowedPath);
  const mimeType = await detectMime({ buffer, filePath: allowedPath });
  return { path: allowedPath, base64: buffer.toString("base64"), mimeType };
}

export function createBrowserProxyDispatcher() {
  return createBrowserRouteDispatcher(createBrowserControlContext());
}
