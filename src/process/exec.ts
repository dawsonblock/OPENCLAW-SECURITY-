import path from "node:path";
import { danger, shouldLogVerbose } from "../globals.js";
import { logDebug, logError } from "../logger.js";
import { runAllowedCommand, spawnAllowed } from "../security/subprocess.js";
import { resolveCommandStdio } from "./spawn-utils.js";

/**
 * Resolves a command for Windows compatibility.
 * On Windows, non-.exe commands (like npm, pnpm) require their .cmd extension.
 */
function resolveCommand(command: string): string {
  if (process.platform !== "win32") {
    return command;
  }
  const basename = path.basename(command).toLowerCase();
  // Skip if already has an extension (.cmd, .exe, .bat, etc.)
  const ext = path.extname(basename);
  if (ext) {
    return command;
  }
  // Common npm-related commands that need .cmd extension on Windows
  const cmdCommands = ["npm", "pnpm", "yarn", "npx"];
  if (cmdCommands.includes(basename)) {
    return `${command}.cmd`;
  }
  return command;
}

export type RunExecOptions = {
  timeoutMs?: number;
  maxBuffer?: number;
  allowedBins: string[];
  allowAbsolutePath?: boolean;
  inheritEnv?: boolean;
  allowEnv?: Iterable<string>;
  envOverrides?: Record<string, string | undefined>;
};

// Run a command with scrubbed environment + executable allowlist.
export async function runExec(
  command: string,
  args: string[],
  opts: number | RunExecOptions = 10_000,
): Promise<{ stdout: string; stderr: string }> {
  const options: RunExecOptions =
    typeof opts === "number"
      ? {
          timeoutMs: opts,
          allowedBins: [path.basename(command)],
        }
      : opts;
  if (!Array.isArray(options.allowedBins) || options.allowedBins.length === 0) {
    throw new Error("runExec: allowedBins is required");
  }
  const resolvedCommand = resolveCommand(command);
  const allowAbsolutePath = options.allowAbsolutePath === true;
  try {
    const { code, signal, stdout, stderr } = await runAllowedCommand({
      command: resolvedCommand,
      args,
      allowedBins: options.allowedBins,
      allowAbsolutePath,
      timeoutMs: options.timeoutMs,
      maxStdoutBytes: options.maxBuffer,
      maxStderrBytes: options.maxBuffer,
      inheritEnv: options.inheritEnv,
      allowEnv: options.allowEnv,
      envOverrides: options.envOverrides,
    });
    if (code !== 0) {
      const err = new Error(
        `Command failed: ${resolvedCommand} ${args.join(" ")} (code=${code ?? "null"}, signal=${signal ?? "null"})`,
      ) as Error & {
        code?: number | null;
        signal?: NodeJS.Signals | null;
        stdout?: string;
        stderr?: string;
      };
      err.code = code;
      err.signal = signal;
      err.stdout = stdout;
      err.stderr = stderr;
      throw err;
    }
    if (shouldLogVerbose()) {
      if (stdout.trim()) {
        logDebug(stdout.trim());
      }
      if (stderr.trim()) {
        logError(stderr.trim());
      }
    }
    return { stdout, stderr };
  } catch (err) {
    if (shouldLogVerbose()) {
      logError(danger(`Command failed: ${command} ${args.join(" ")}`));
    }
    throw err;
  }
}

export type SpawnResult = {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  killed: boolean;
};

export type CommandOptions = {
  timeoutMs: number;
  cwd?: string;
  input?: string;
  // Backward-compatible alias for envOverrides.
  env?: NodeJS.ProcessEnv;
  // Backward-compatible alias for inheritEnv.
  inheritProcessEnv?: boolean;
  allowedBins: string[];
  allowAbsolutePath?: boolean;
  inheritEnv?: boolean;
  allowEnv?: Iterable<string>;
  envOverrides?: Record<string, string | undefined>;
  windowsVerbatimArguments?: boolean;
};

export async function runCommandWithTimeout(
  argv: string[],
  optionsOrTimeout: number | CommandOptions,
): Promise<SpawnResult> {
  if (!argv?.length || !argv[0]?.trim()) {
    throw new Error("runCommandWithTimeout: empty argv");
  }

  const options: CommandOptions =
    typeof optionsOrTimeout === "number"
      ? ({ timeoutMs: optionsOrTimeout, allowedBins: [] } as CommandOptions)
      : optionsOrTimeout;
  const { timeoutMs, cwd, input, env, inheritProcessEnv, allowEnv, envOverrides } = options;
  const { windowsVerbatimArguments } = options;
  const hasInput = input !== undefined;
  if (!Array.isArray(options.allowedBins) || options.allowedBins.length === 0) {
    throw new Error("runCommandWithTimeout: allowedBins is required");
  }

  const shouldSuppressNpmFund = (() => {
    const cmd = path.basename(argv[0] ?? "");
    if (cmd === "npm" || cmd === "npm.cmd" || cmd === "npm.exe") {
      return true;
    }
    if (cmd === "node" || cmd === "node.exe") {
      const script = argv[1] ?? "";
      return script.includes("npm-cli.js");
    }
    return false;
  })();

  const mergedEnvOverrides: Record<string, string | undefined> = {
    ...envOverrides,
    ...(env as Record<string, string | undefined> | undefined),
  };
  if (shouldSuppressNpmFund) {
    if (mergedEnvOverrides.NPM_CONFIG_FUND == null) {
      mergedEnvOverrides.NPM_CONFIG_FUND = "false";
    }
    if (mergedEnvOverrides.npm_config_fund == null) {
      mergedEnvOverrides.npm_config_fund = "false";
    }
  }

  const stdio = resolveCommandStdio({ hasInput, preferInherit: true });
  const command = resolveCommand(argv[0]);
  const child = spawnAllowed({
    command,
    args: argv.slice(1),
    allowedBins: options.allowedBins,
    allowAbsolutePath: options.allowAbsolutePath === true,
    cwd,
    stdio,
    windowsHide: true,
    windowsVerbatimArguments,
    inheritEnv: options.inheritEnv ?? inheritProcessEnv !== false,
    allowEnv,
    envOverrides: mergedEnvOverrides,
  });
  // Spawn with inherited stdin (TTY) so tools like `pi` stay interactive when needed.
  return await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (typeof child.kill === "function") {
        child.kill("SIGKILL");
      }
    }, timeoutMs);

    if (hasInput && child.stdin) {
      child.stdin.write(input ?? "");
      child.stdin.end();
    }

    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code, signal, killed: child.killed });
    });
  });
}
