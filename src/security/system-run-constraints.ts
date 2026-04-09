type ConstraintParams = {
  command?: string | null;
  argv?: string[] | null;
};

const SHELL_LIKE_BINS = new Set(["sh", "bash", "zsh", "fish", "dash", "ksh"]);
const PYTHON_LIKE_BINS = new Set(["python", "python3", "python2"]);
const POWERSHELL_LIKE_BINS = new Set(["powershell", "pwsh"]);

const NODE_LIKE_BINS = new Set(["node", "nodejs", "bun", "deno"]);
const CMD_LIKE_BINS = new Set(["cmd", "cmd.exe"]);
const ALL_INTERPRETER_BINS = new Set([
  ...SHELL_LIKE_BINS,
  ...PYTHON_LIKE_BINS,
  ...POWERSHELL_LIKE_BINS,
  ...NODE_LIKE_BINS,
  ...CMD_LIKE_BINS,
]);

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function includesArg(argv: string[], values: string[]): boolean {
  const normalized = new Set(argv.map((token) => normalizeToken(token)));
  return values.some((token) => normalized.has(token));
}

function hasPrefix(argv: string[], bins: Set<string>): boolean {
  if (argv.length === 0) {
    return false;
  }
  return bins.has(normalizeToken(argv[0] ?? ""));
}

function shellExecAllowed(): boolean {
  const val = process.env.OPENCLAW_ALLOW_SHELL_EXEC?.trim().toLowerCase();
  return val === "1" || val === "true";
}

export function validateSystemRunCommand(
  params: ConstraintParams,
): { ok: true } | { ok: false; reason: string } {
  const argv = Array.isArray(params.argv) ? params.argv.map((token) => String(token)) : [];
  const command = typeof params.command === "string" ? params.command.trim().toLowerCase() : "";

  if (argv.length > 0) {
    if (
      normalizeToken(argv[0] ?? "") === "rm" &&
      includesArg(argv, ["-rf", "-fr", "--no-preserve-root"])
    ) {
      return { ok: false, reason: "rm -rf style command is not allowed" };
    }
    if (hasPrefix(argv, SHELL_LIKE_BINS) && includesArg(argv, ["-c"])) {
      return { ok: false, reason: "shell -c execution is not allowed" };
    }
    if (hasPrefix(argv, PYTHON_LIKE_BINS) && includesArg(argv, ["-c"])) {
      return { ok: false, reason: "python -c execution is not allowed" };
    }
    if (hasPrefix(argv, POWERSHELL_LIKE_BINS) && includesArg(argv, ["-enc", "-encodedcommand"])) {
      return { ok: false, reason: "powershell encoded command execution is not allowed" };
    }

    // ── Block bare shell/interpreter invocations unless break-glass ──
    if (!shellExecAllowed() && hasPrefix(argv, ALL_INTERPRETER_BINS)) {
      const bin = normalizeToken(argv[0] ?? "");
      return {
        ok: false,
        reason: `bare interpreter "${bin}" is blocked (set OPENCLAW_ALLOW_SHELL_EXEC=1 to override)`,
      };
    }
  }

  if (command) {
    if (command.includes("curl") && command.includes("|") && command.includes("bash")) {
      return { ok: false, reason: "curl|bash style command is not allowed" };
    }
  }

  return { ok: true };
}
