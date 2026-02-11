import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { OpenClawConfig } from "../config/config.js";
import { resolveBrewExecutable } from "../infra/brew.js";
import { fetchWithSsrFGuard } from "../infra/net/fetch-guard.js";
import { runCommandWithTimeout } from "../process/exec.js";
import { scanDirectoryWithSummary } from "../security/skill-scanner.js";
import { buildScrubbedEnv } from "../security/subprocess.js";
import { CONFIG_DIR, ensureDir, resolveUserPath } from "../utils.js";
import {
  hasBinary,
  loadWorkspaceSkillEntries,
  resolveSkillsInstallPreferences,
  type SkillEntry,
  type SkillInstallSpec,
  type SkillsInstallPreferences,
} from "./skills.js";
import { resolveSkillKey } from "./skills/frontmatter.js";

export type SkillInstallRequest = {
  workspaceDir: string;
  skillName: string;
  installId: string;
  timeoutMs?: number;
  config?: OpenClawConfig;
};

export type SkillInstallResult = {
  ok: boolean;
  message: string;
  stdout: string;
  stderr: string;
  code: number | null;
  warnings?: string[];
};

function isNodeReadableStream(value: unknown): value is NodeJS.ReadableStream {
  return Boolean(value && typeof (value as NodeJS.ReadableStream).pipe === "function");
}

function summarizeInstallOutput(text: string): string | undefined {
  const raw = text.trim();
  if (!raw) {
    return undefined;
  }
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return undefined;
  }

  const preferred =
    lines.find((line) => /^error\b/i.test(line)) ??
    lines.find((line) => /\b(err!|error:|failed)\b/i.test(line)) ??
    lines.at(-1);

  if (!preferred) {
    return undefined;
  }
  const normalized = preferred.replace(/\s+/g, " ").trim();
  const maxLen = 200;
  return normalized.length > maxLen ? `${normalized.slice(0, maxLen - 1)}…` : normalized;
}

function formatInstallFailureMessage(result: {
  code: number | null;
  stdout: string;
  stderr: string;
}): string {
  const code = typeof result.code === "number" ? `exit ${result.code}` : "unknown exit";
  const summary = summarizeInstallOutput(result.stderr) ?? summarizeInstallOutput(result.stdout);
  if (!summary) {
    return `Install failed (${code})`;
  }
  return `Install failed (${code}): ${summary}`;
}

function withWarnings(result: SkillInstallResult, warnings: string[]): SkillInstallResult {
  if (warnings.length === 0) {
    return result;
  }
  return {
    ...result,
    warnings: warnings.slice(),
  };
}

function formatScanFindingDetail(
  rootDir: string,
  finding: { message: string; file: string; line: number },
): string {
  const relativePath = path.relative(rootDir, finding.file);
  const filePath =
    relativePath && relativePath !== "." && !relativePath.startsWith("..")
      ? relativePath
      : path.basename(finding.file);
  return `${finding.message} (${filePath}:${finding.line})`;
}

async function collectSkillInstallScanOutcome(entry: SkillEntry): Promise<{
  warnings: string[];
  criticalCount: number;
  scanFailed: boolean;
}> {
  const warnings: string[] = [];
  const skillName = entry.skill.name;
  const skillDir = path.resolve(entry.skill.baseDir);
  let criticalCount = 0;
  let scanFailed = false;

  try {
    const summary = await scanDirectoryWithSummary(skillDir);
    criticalCount = summary.critical;
    if (summary.critical > 0) {
      const criticalDetails = summary.findings
        .filter((finding) => finding.severity === "critical")
        .map((finding) => formatScanFindingDetail(skillDir, finding))
        .join("; ");
      warnings.push(
        `WARNING: Skill "${skillName}" contains dangerous code patterns: ${criticalDetails}`,
      );
    } else if (summary.warn > 0) {
      warnings.push(
        `Skill "${skillName}" has ${summary.warn} suspicious code pattern(s). Run "openclaw security audit --deep" for details.`,
      );
    }
  } catch (err) {
    scanFailed = true;
    warnings.push(`Skill "${skillName}" code safety scan failed (${String(err)}).`);
  }

  return { warnings, criticalCount, scanFailed };
}

function resolveInstallId(spec: SkillInstallSpec, index: number): string {
  return (spec.id ?? `${spec.kind}-${index}`).trim();
}

function findInstallSpec(entry: SkillEntry, installId: string): SkillInstallSpec | undefined {
  const specs = entry.metadata?.install ?? [];
  for (const [index, spec] of specs.entries()) {
    if (resolveInstallId(spec, index) === installId) {
      return spec;
    }
  }
  return undefined;
}

function buildNodeInstallCommand(packageName: string, prefs: SkillsInstallPreferences): string[] {
  const allowNpmScripts = process.env.OPENCLAW_ALLOW_NPM_SCRIPTS === "1";
  switch (prefs.nodeManager) {
    case "pnpm":
      return ["pnpm", "add", "-g", packageName];
    case "yarn":
      return ["yarn", "global", "add", packageName];
    case "bun":
      return ["bun", "add", "-g", packageName];
    default:
      return allowNpmScripts
        ? ["npm", "install", "-g", packageName]
        : ["npm", "install", "-g", packageName, "--ignore-scripts"];
  }
}

function buildInstallCommand(
  spec: SkillInstallSpec,
  prefs: SkillsInstallPreferences,
): {
  argv: string[] | null;
  error?: string;
} {
  switch (spec.kind) {
    case "brew": {
      if (!spec.formula) {
        return { argv: null, error: "missing brew formula" };
      }
      return { argv: ["brew", "install", spec.formula] };
    }
    case "node": {
      if (!spec.package) {
        return { argv: null, error: "missing node package" };
      }
      return {
        argv: buildNodeInstallCommand(spec.package, prefs),
      };
    }
    case "go": {
      if (!spec.module) {
        return { argv: null, error: "missing go module" };
      }
      return { argv: ["go", "install", spec.module] };
    }
    case "uv": {
      if (!spec.package) {
        return { argv: null, error: "missing uv package" };
      }
      return { argv: ["uv", "tool", "install", spec.package] };
    }
    case "download": {
      return { argv: null, error: "download install handled separately" };
    }
    default:
      return { argv: null, error: "unsupported installer" };
  }
}

function resolveDownloadTargetDir(entry: SkillEntry, spec: SkillInstallSpec): string {
  if (spec.targetDir?.trim()) {
    return resolveUserPath(spec.targetDir);
  }
  const key = resolveSkillKey(entry.skill, entry);
  return path.join(CONFIG_DIR, "tools", key);
}

function resolveArchiveType(spec: SkillInstallSpec, filename: string): string | undefined {
  const explicit = spec.archive?.trim().toLowerCase();
  if (explicit) {
    return explicit;
  }
  const lower = filename.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
    return "tar.gz";
  }
  if (lower.endsWith(".tar.bz2") || lower.endsWith(".tbz2")) {
    return "tar.bz2";
  }
  if (lower.endsWith(".zip")) {
    return "zip";
  }
  return undefined;
}

const DEFAULT_MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;
const DEFAULT_MAX_ARCHIVE_ENTRIES = 10_000;
const DEFAULT_MAX_EXTRACTED_BYTES = 250 * 1024 * 1024;

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

function parseArchiveListOutput(text: string): string[] {
  return text
    .split("\n")
    .map((entry) => normalizeArchiveEntryPath(entry))
    .filter(Boolean);
}

function parseTarTypeViolations(text: string): string[] {
  const disallowed: string[] = [];
  const lines = text.split("\n").map((line) => line.trimEnd());
  for (const line of lines) {
    const normalized = line.trimStart();
    if (!normalized) {
      continue;
    }
    const typePrefix = normalized[0];
    // tar -tvf starts each line with a file type marker in the mode string:
    // '-' file, 'd' dir, 'l' symlink, 'h' hard link, 'b' block device, etc.
    if (typePrefix !== "-" && typePrefix !== "d") {
      disallowed.push(normalized);
    }
  }
  return disallowed;
}

async function listArchiveEntries(params: {
  archivePath: string;
  archiveType: string;
  timeoutMs: number;
}): Promise<
  { entries: string[] } | { error: { stdout: string; stderr: string; code: number | null } }
> {
  const { archivePath, archiveType, timeoutMs } = params;

  if (archiveType === "zip") {
    if (!hasBinary("unzip")) {
      return { error: { stdout: "", stderr: "unzip not found on PATH", code: null } };
    }
    const result = await runCommandWithTimeout(["unzip", "-Z1", archivePath], { timeoutMs });
    if (result.code !== 0) {
      return { error: { stdout: result.stdout, stderr: result.stderr, code: result.code } };
    }
    return { entries: parseArchiveListOutput(result.stdout) };
  }

  if (!hasBinary("tar")) {
    return { error: { stdout: "", stderr: "tar not found on PATH", code: null } };
  }
  const result = await runCommandWithTimeout(["tar", "tf", archivePath], { timeoutMs });
  if (result.code !== 0) {
    return { error: { stdout: result.stdout, stderr: result.stderr, code: result.code } };
  }

  const verboseResult = await runCommandWithTimeout(["tar", "tvf", archivePath], { timeoutMs });
  if (verboseResult.code !== 0) {
    return {
      error: {
        stdout: verboseResult.stdout,
        stderr: verboseResult.stderr,
        code: verboseResult.code,
      },
    };
  }
  const typeViolations = parseTarTypeViolations(verboseResult.stdout);
  if (typeViolations.length > 0) {
    return {
      error: {
        stdout: "",
        stderr:
          "blocked unsupported tar entry types: " +
          typeViolations.slice(0, 3).join(" | ") +
          (typeViolations.length > 3 ? " | ..." : ""),
        code: 1,
      },
    };
  }

  return { entries: parseArchiveListOutput(result.stdout) };
}

async function validateExtractedTree(params: { rootDir: string; maxBytes: number }): Promise<void> {
  const { rootDir, maxBytes } = params;
  const stack = [rootDir];
  let totalBytes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const stat = await fs.promises.lstat(fullPath);

      if (stat.isSymbolicLink()) {
        throw new Error(`Archive contains symbolic link: ${entry.name}`);
      }
      if (stat.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`Archive contains unsupported entry type: ${entry.name}`);
      }

      totalBytes += stat.size;
      if (totalBytes > maxBytes) {
        throw new Error(`Archive exceeds extracted size limit (${maxBytes} bytes)`);
      }
    }
  }
}

async function moveStagedEntry(src: string, dst: string): Promise<void> {
  try {
    await fs.promises.rename(src, dst);
    return;
  } catch (err) {
    if (
      !(err instanceof Error) ||
      !("code" in err) ||
      (err as { code?: string }).code !== "EXDEV"
    ) {
      throw err;
    }
  }

  const stat = await fs.promises.lstat(src);
  if (stat.isDirectory()) {
    await fs.promises.cp(src, dst, { recursive: true, force: true });
    await fs.promises.rm(src, { recursive: true, force: true });
    return;
  }

  await fs.promises.copyFile(src, dst);
  await fs.promises.rm(src, { force: true });
}

async function downloadFile(
  url: string,
  destPath: string,
  timeoutMs: number,
): Promise<{ bytes: number }> {
  const maxDownloadBytes = readPositiveIntEnv(
    "OPENCLAW_SKILL_DOWNLOAD_MAX_BYTES",
    DEFAULT_MAX_DOWNLOAD_BYTES,
  );
  const { response, release } = await fetchWithSsrFGuard({
    url,
    timeoutMs: Math.max(1_000, timeoutMs),
  });
  try {
    if (!response.ok || !response.body) {
      throw new Error(`Download failed (${response.status} ${response.statusText})`);
    }
    await ensureDir(path.dirname(destPath));
    const file = fs.createWriteStream(destPath);
    let downloadedBytes = 0;
    const limiter = new Transform({
      transform(chunk, _encoding, callback) {
        const size = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
        downloadedBytes += size;
        if (downloadedBytes > maxDownloadBytes) {
          callback(new Error(`Download too large (>${maxDownloadBytes} bytes)`));
          return;
        }
        callback(null, chunk);
      },
    });
    const body = response.body as unknown;
    const readable = isNodeReadableStream(body)
      ? body
      : Readable.fromWeb(body as NodeReadableStream);
    await pipeline(readable, limiter, file);
    const stat = await fs.promises.stat(destPath);
    return { bytes: stat.size };
  } finally {
    await release();
  }
}

async function extractArchive(params: {
  archivePath: string;
  archiveType: string;
  targetDir: string;
  stripComponents?: number;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const { archivePath, archiveType, targetDir, stripComponents, timeoutMs } = params;
  const maxEntries = readPositiveIntEnv(
    "OPENCLAW_SKILL_ARCHIVE_MAX_ENTRIES",
    DEFAULT_MAX_ARCHIVE_ENTRIES,
  );
  const maxExtractedBytes = readPositiveIntEnv(
    "OPENCLAW_SKILL_ARCHIVE_MAX_BYTES",
    DEFAULT_MAX_EXTRACTED_BYTES,
  );

  const listed = await listArchiveEntries({ archivePath, archiveType, timeoutMs });
  if ("error" in listed) {
    return listed.error;
  }

  if (listed.entries.length === 0) {
    return { stdout: "", stderr: "archive is empty", code: 1 };
  }
  if (listed.entries.length > maxEntries) {
    return {
      stdout: "",
      stderr: `archive has too many entries (${listed.entries.length} > ${maxEntries})`,
      code: 1,
    };
  }
  for (const entryPath of listed.entries) {
    if (isUnsafeArchiveEntryPath(entryPath)) {
      return { stdout: "", stderr: `blocked unsafe archive entry: ${entryPath}`, code: 1 };
    }
  }

  const stageRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openclaw-skill-install-"));
  const stageExtractDir = path.join(stageRoot, "extract");
  await fs.promises.mkdir(stageExtractDir, { recursive: true });

  try {
    let extractionResult: { stdout: string; stderr: string; code: number | null };
    if (archiveType === "zip") {
      if (!hasBinary("unzip")) {
        return { stdout: "", stderr: "unzip not found on PATH", code: null };
      }
      extractionResult = await runCommandWithTimeout(
        ["unzip", "-q", archivePath, "-d", stageExtractDir],
        { timeoutMs },
      );
    } else {
      if (!hasBinary("tar")) {
        return { stdout: "", stderr: "tar not found on PATH", code: null };
      }
      const argv = ["tar", "xf", archivePath, "-C", stageExtractDir];
      if (typeof stripComponents === "number" && Number.isFinite(stripComponents)) {
        argv.push("--strip-components", String(Math.max(0, Math.floor(stripComponents))));
      }
      extractionResult = await runCommandWithTimeout(argv, { timeoutMs });
    }

    if (extractionResult.code !== 0) {
      return extractionResult;
    }

    try {
      await validateExtractedTree({ rootDir: stageExtractDir, maxBytes: maxExtractedBytes });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { stdout: extractionResult.stdout, stderr: message, code: 1 };
    }

    await ensureDir(targetDir);
    const stagedEntries = await fs.promises.readdir(stageExtractDir, { withFileTypes: true });
    for (const entry of stagedEntries) {
      const src = path.join(stageExtractDir, entry.name);
      const dst = path.join(targetDir, entry.name);
      await fs.promises.rm(dst, { recursive: true, force: true });
      await moveStagedEntry(src, dst);
    }

    return extractionResult;
  } finally {
    await fs.promises.rm(stageRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function installDownloadSpec(params: {
  entry: SkillEntry;
  spec: SkillInstallSpec;
  timeoutMs: number;
}): Promise<SkillInstallResult> {
  const { entry, spec, timeoutMs } = params;
  const url = spec.url?.trim();
  if (!url) {
    return {
      ok: false,
      message: "missing download url",
      stdout: "",
      stderr: "",
      code: null,
    };
  }

  let filename = "";
  try {
    const parsed = new URL(url);
    filename = path.basename(parsed.pathname);
  } catch {
    filename = path.basename(url);
  }
  if (!filename) {
    filename = "download";
  }

  const targetDir = resolveDownloadTargetDir(entry, spec);
  await ensureDir(targetDir);

  const archivePath = path.join(targetDir, filename);
  let downloaded = 0;
  try {
    const result = await downloadFile(url, archivePath, timeoutMs);
    downloaded = result.bytes;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message, stdout: "", stderr: message, code: null };
  }

  const archiveType = resolveArchiveType(spec, filename);
  const shouldExtract = spec.extract ?? Boolean(archiveType);
  if (!shouldExtract) {
    return {
      ok: true,
      message: `Downloaded to ${archivePath}`,
      stdout: `downloaded=${downloaded}`,
      stderr: "",
      code: 0,
    };
  }

  if (!archiveType) {
    return {
      ok: false,
      message: "extract requested but archive type could not be detected",
      stdout: "",
      stderr: "",
      code: null,
    };
  }

  const extractResult = await extractArchive({
    archivePath,
    archiveType,
    targetDir,
    stripComponents: spec.stripComponents,
    timeoutMs,
  });
  const success = extractResult.code === 0;
  return {
    ok: success,
    message: success
      ? `Downloaded and extracted to ${targetDir}`
      : formatInstallFailureMessage(extractResult),
    stdout: extractResult.stdout.trim(),
    stderr: extractResult.stderr.trim(),
    code: extractResult.code,
  };
}

async function resolveBrewBinDir(timeoutMs: number, brewExe?: string): Promise<string | undefined> {
  const exe = brewExe ?? (hasBinary("brew") ? "brew" : resolveBrewExecutable());
  if (!exe) {
    return undefined;
  }

  const prefixResult = await runCommandWithTimeout([exe, "--prefix"], {
    timeoutMs: Math.min(timeoutMs, 30_000),
  });
  if (prefixResult.code === 0) {
    const prefix = prefixResult.stdout.trim();
    if (prefix) {
      return path.join(prefix, "bin");
    }
  }

  const envPrefix = process.env.HOMEBREW_PREFIX?.trim();
  if (envPrefix) {
    return path.join(envPrefix, "bin");
  }

  for (const candidate of ["/opt/homebrew/bin", "/usr/local/bin"]) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}

export async function installSkill(params: SkillInstallRequest): Promise<SkillInstallResult> {
  const timeoutMs = Math.min(Math.max(params.timeoutMs ?? 300_000, 1_000), 900_000);
  const workspaceDir = resolveUserPath(params.workspaceDir);
  const entries = loadWorkspaceSkillEntries(workspaceDir);
  const entry = entries.find((item) => item.skill.name === params.skillName);
  if (!entry) {
    return {
      ok: false,
      message: `Skill not found: ${params.skillName}`,
      stdout: "",
      stderr: "",
      code: null,
    };
  }

  const spec = findInstallSpec(entry, params.installId);
  const scanOutcome = await collectSkillInstallScanOutcome(entry);
  const warnings = scanOutcome.warnings;
  if (scanOutcome.scanFailed && process.env.OPENCLAW_ALLOW_UNSCANNED_SKILL_INSTALL !== "1") {
    return withWarnings(
      {
        ok: false,
        message: "skill scan failed; set OPENCLAW_ALLOW_UNSCANNED_SKILL_INSTALL=1 to override",
        stdout: "",
        stderr: "",
        code: null,
      },
      warnings,
    );
  }
  if (scanOutcome.scanFailed) {
    warnings.push(
      "OPENCLAW_ALLOW_UNSCANNED_SKILL_INSTALL=1 is set; continuing install without scanner coverage.",
    );
  }
  if (scanOutcome.criticalCount > 0 && process.env.OPENCLAW_ALLOW_UNSAFE_SKILL_INSTALL !== "1") {
    return withWarnings(
      {
        ok: false,
        message:
          `skill scan found ${scanOutcome.criticalCount} critical issue(s); ` +
          "set OPENCLAW_ALLOW_UNSAFE_SKILL_INSTALL=1 to override",
        stdout: "",
        stderr: "",
        code: null,
      },
      warnings,
    );
  }
  if (!spec) {
    return withWarnings(
      {
        ok: false,
        message: `Installer not found: ${params.installId}`,
        stdout: "",
        stderr: "",
        code: null,
      },
      warnings,
    );
  }
  if (spec.kind === "download") {
    const downloadResult = await installDownloadSpec({ entry, spec, timeoutMs });
    return withWarnings(downloadResult, warnings);
  }

  const prefs = resolveSkillsInstallPreferences(params.config);
  const command = buildInstallCommand(spec, prefs);
  if (command.error) {
    return withWarnings(
      {
        ok: false,
        message: command.error,
        stdout: "",
        stderr: "",
        code: null,
      },
      warnings,
    );
  }

  const brewExe = hasBinary("brew") ? "brew" : resolveBrewExecutable();
  if (spec.kind === "brew" && !brewExe) {
    return withWarnings(
      {
        ok: false,
        message: "brew not installed",
        stdout: "",
        stderr: "",
        code: null,
      },
      warnings,
    );
  }
  if (spec.kind === "uv" && !hasBinary("uv")) {
    if (brewExe) {
      const brewResult = await runCommandWithTimeout([brewExe, "install", "uv"], {
        timeoutMs,
      });
      if (brewResult.code !== 0) {
        return withWarnings(
          {
            ok: false,
            message: "Failed to install uv (brew)",
            stdout: brewResult.stdout.trim(),
            stderr: brewResult.stderr.trim(),
            code: brewResult.code,
          },
          warnings,
        );
      }
    } else {
      return withWarnings(
        {
          ok: false,
          message: "uv not installed (install via brew)",
          stdout: "",
          stderr: "",
          code: null,
        },
        warnings,
      );
    }
  }
  if (!command.argv || command.argv.length === 0) {
    return withWarnings(
      {
        ok: false,
        message: "invalid install command",
        stdout: "",
        stderr: "",
        code: null,
      },
      warnings,
    );
  }

  if (spec.kind === "brew" && brewExe && command.argv[0] === "brew") {
    command.argv[0] = brewExe;
  }

  if (spec.kind === "go" && !hasBinary("go")) {
    if (brewExe) {
      const brewResult = await runCommandWithTimeout([brewExe, "install", "go"], {
        timeoutMs,
      });
      if (brewResult.code !== 0) {
        return withWarnings(
          {
            ok: false,
            message: "Failed to install go (brew)",
            stdout: brewResult.stdout.trim(),
            stderr: brewResult.stderr.trim(),
            code: brewResult.code,
          },
          warnings,
        );
      }
    } else {
      return withWarnings(
        {
          ok: false,
          message: "go not installed (install via brew)",
          stdout: "",
          stderr: "",
          code: null,
        },
        warnings,
      );
    }
  }

  let env: NodeJS.ProcessEnv | undefined;
  let inheritProcessEnv: boolean | undefined;
  if (spec.kind === "go" && brewExe) {
    const brewBin = await resolveBrewBinDir(timeoutMs, brewExe);
    if (brewBin) {
      env = { GOBIN: brewBin };
    }
  }

  if (spec.kind === "node") {
    const allowNpmScripts = process.env.OPENCLAW_ALLOW_NPM_SCRIPTS === "1";
    env = buildScrubbedEnv({
      envOverrides: {
        ...env,
        COREPACK_ENABLE_STRICT: "0",
        COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
        ...(allowNpmScripts
          ? {}
          : {
              npm_config_ignore_scripts: "true",
              NPM_CONFIG_IGNORE_SCRIPTS: "true",
            }),
      },
    });
    inheritProcessEnv = false;
  }

  const result = await (async () => {
    const argv = command.argv;
    if (!argv || argv.length === 0) {
      return { code: null, stdout: "", stderr: "invalid install command" };
    }
    try {
      return await runCommandWithTimeout(argv, {
        timeoutMs,
        env,
        inheritProcessEnv,
      });
    } catch (err) {
      const stderr = err instanceof Error ? err.message : String(err);
      return { code: null, stdout: "", stderr };
    }
  })();

  const success = result.code === 0;
  return withWarnings(
    {
      ok: success,
      message: success ? "Installed" : formatInstallFailureMessage(result),
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      code: result.code,
    },
    warnings,
  );
}
