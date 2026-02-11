import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import path from "node:path";

const DEFAULT_ALLOWED_ENV_KEYS = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
] as const;

const BLOCKED_ENV_KEYS = new Set([
  "NODE_OPTIONS",
  "LD_PRELOAD",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
]);

function normalizeExecutableName(value: string): string {
  const base = path.basename(value).toLowerCase();
  return base.replace(/\.(exe|cmd|bat)$/i, "");
}

function toAllowedExecutableSet(allowedBins: Iterable<string>): Set<string> {
  const set = new Set<string>();
  for (const entry of allowedBins) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    set.add(normalizeExecutableName(trimmed));
  }
  return set;
}

function isExecutableAllowed(command: string, allowedBins: Iterable<string>): boolean {
  const normalizedCommand = normalizeExecutableName(command);
  const allowed = toAllowedExecutableSet(allowedBins);
  return allowed.has(normalizedCommand);
}

export function buildScrubbedEnv(params?: {
  inheritEnv?: boolean;
  allowEnv?: Iterable<string>;
  envOverrides?: Record<string, string | undefined>;
}): NodeJS.ProcessEnv {
  const allowEnv = new Set(
    [...(params?.allowEnv ?? DEFAULT_ALLOWED_ENV_KEYS)].map((key) => key.trim()).filter(Boolean),
  );
  const env: NodeJS.ProcessEnv = {};
  if (params?.inheritEnv !== false) {
    for (const key of allowEnv) {
      const value = process.env[key];
      if (typeof value === "string") {
        env[key] = value;
      }
    }
  }

  for (const [key, value] of Object.entries(params?.envOverrides ?? {})) {
    if (typeof value === "string") {
      env[key] = value;
    } else {
      delete env[key];
    }
  }

  for (const key of BLOCKED_ENV_KEYS) {
    delete env[key];
  }

  return env;
}

export function spawnAllowed(params: {
  command: string;
  args: string[];
  allowedBins: Iterable<string>;
  allowAbsolutePath?: boolean;
  cwd?: string;
  stdio?: SpawnOptions["stdio"];
  shell?: boolean;
  windowsHide?: boolean;
  detached?: boolean;
  inheritEnv?: boolean;
  allowEnv?: Iterable<string>;
  envOverrides?: Record<string, string | undefined>;
}): ChildProcess {
  const command = params.command.trim();
  if (!command) {
    throw new Error("Blocked executable: empty command");
  }
  if (path.isAbsolute(command)) {
    if (params.allowAbsolutePath !== true) {
      throw new Error(`Blocked executable path: ${command}`);
    }
  } else if (command.includes("/") || command.includes("\\")) {
    throw new Error(`Blocked executable path: ${command}`);
  }

  if (!isExecutableAllowed(command, params.allowedBins)) {
    throw new Error(`Blocked executable: ${command}`);
  }
  const env = buildScrubbedEnv({
    inheritEnv: params.inheritEnv,
    allowEnv: params.allowEnv,
    envOverrides: params.envOverrides,
  });
  return spawn(command, params.args, {
    cwd: params.cwd,
    stdio: params.stdio,
    shell: params.shell,
    windowsHide: params.windowsHide,
    detached: params.detached,
    env,
  });
}

export async function runAllowedCommand(params: {
  command: string;
  args: string[];
  allowedBins: Iterable<string>;
  allowAbsolutePath?: boolean;
  cwd?: string;
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  inheritEnv?: boolean;
  allowEnv?: Iterable<string>;
  envOverrides?: Record<string, string | undefined>;
}): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}> {
  const timeoutMs = Math.max(100, Math.floor(params.timeoutMs ?? 10_000));
  const maxStdoutBytes = Math.max(1_024, Math.floor(params.maxStdoutBytes ?? 1_000_000));
  const maxStderrBytes = Math.max(1_024, Math.floor(params.maxStderrBytes ?? 500_000));

  const child = spawnAllowed({
    command: params.command,
    args: params.args,
    allowedBins: params.allowedBins,
    allowAbsolutePath: params.allowAbsolutePath,
    cwd: params.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    inheritEnv: params.inheritEnv,
    allowEnv: params.allowEnv,
    envOverrides: params.envOverrides,
  });

  return await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        child.kill("SIGKILL");
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      const data = String(chunk);
      stdoutBytes += Buffer.byteLength(data, "utf8");
      if (stdoutBytes > maxStdoutBytes) {
        finish(() => {
          child.kill("SIGKILL");
          reject(new Error(`Command stdout exceeded ${maxStdoutBytes} bytes`));
        });
        return;
      }
      stdout += data;
    });

    child.stderr?.on("data", (chunk) => {
      const data = String(chunk);
      stderrBytes += Buffer.byteLength(data, "utf8");
      if (stderrBytes > maxStderrBytes) {
        finish(() => {
          child.kill("SIGKILL");
          reject(new Error(`Command stderr exceeded ${maxStderrBytes} bytes`));
        });
        return;
      }
      stderr += data;
    });

    child.once("error", (err) => {
      finish(() => reject(err));
    });

    child.once("close", (code, signal) => {
      finish(() => resolve({ code, signal, stdout, stderr }));
    });
  });
}
