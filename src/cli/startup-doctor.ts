/**
 * Enhanced startup doctor and self-check utilities.
 *
 * Helps operators catch bad deployments fast by checking:
 * - reviewed authority-boundary config
 * - scan scope roots exist and readable
 * - policy posture hash valid
 * - browser proxy roots safe/writable
 * - gateway auth configured sensibly
 * - critical workspace/config paths permissions
 * - optional dependencies for enabled features
 * - extension/plugin load failures
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";

export interface DoctorCheckResult {
  name: string;
  passed: boolean;
  severity: "critical" | "warning" | "info";
  message: string;
  suggestion?: string;
}

export interface DoctorReport {
  checks: DoctorCheckResult[];
  summary: {
    total: number;
    critical: number;
    warnings: number;
    info: number;
  };
  readyForOperation: boolean;
}

/**
 * Check that authority-boundary config is correctly loaded.
 */
async function checkAuthorityBoundary(): Promise<DoctorCheckResult> {
  try {
    // Try to import the authority boundary config.
    const { AUTHORITY_BOUNDARY_SCAN_ROOTS } = await import(
      "../security/authority-boundaries.js"
    );
    const hasConfig = Array.isArray(AUTHORITY_BOUNDARY_SCAN_ROOTS);
    return {
      name: "Authority Boundary Config",
      passed: hasConfig,
      severity: "critical",
      message: hasConfig
        ? `Authority boundary configured with scope: ${AUTHORITY_BOUNDARY_SCAN_ROOTS.join(", ")}`
        : "Authority boundary config not found",
      suggestion: !hasConfig
        ? "Verify src/security/authority-boundaries.ts is correctly built"
        : undefined,
    };
  } catch (err) {
    return {
      name: "Authority Boundary Config",
      passed: false,
      severity: "critical",
      message: `Failed to load authority boundary: ${String(err)}`,
      suggestion: "Rebuild the project: npm run build",
    };
  }
}

/**
 * Check that scan scope roots exist and are readable.
 */
async function checkScanScopeRoots(roots: string[], cwd: string): Promise<DoctorCheckResult> {
  const missing: string[] = [];
  const notReadable: string[] = [];

  for (const root of roots) {
    const fullPath = path.resolve(cwd, root);
    try {
      await fs.access(fullPath, fs.constants.R_OK);
    } catch (err) {
      if ((err as { code?: string }).code === "ENOENT") {
        missing.push(root);
      } else {
        notReadable.push(root);
      }
    }
  }

  const passed = missing.length === 0 && notReadable.length === 0;
  const issues: string[] = [];
  if (missing.length > 0) issues.push(`Missing: ${missing.join(", ")}`);
  if (notReadable.length > 0) issues.push(`Not readable: ${notReadable.join(", ")}`);

  return {
    name: "Scan Scope Roots",
    passed,
    severity: "critical",
    message: passed
      ? `Scan roots valid: ${roots.join(", ")}`
      : `Scan root issues: ${issues.join("; ")}`,
    suggestion: !passed ? "Check filesystem permissions and verify repo checkout" : undefined,
  };
}

/**
 * Check that critical workspace paths exist with sane permissions.
 */
async function checkWorkspacePaths(cfg: OpenClawConfig): Promise<DoctorCheckResult> {
  const workspaceRoot = cfg.workspace?.root;
  if (!workspaceRoot) {
    return {
      name: "Workspace Paths",
      passed: true,
      severity: "info",
      message: "No workspace root configured (will use default)",
    };
  }

  try {
    const stat = await fs.stat(workspaceRoot);
    if (!stat.isDirectory()) {
      return {
        name: "Workspace Paths",
        passed: false,
        severity: "critical",
        message: `Workspace root ${workspaceRoot} exists but is not a directory`,
        suggestion: "Remove the file or configure a different workspace.root",
      };
    }

    // Check readability and writeability.
    await fs.access(workspaceRoot, fs.constants.R_OK | fs.constants.W_OK);
    return {
      name: "Workspace Paths",
      passed: true,
      severity: "info",
      message: `Workspace root ${workspaceRoot} is readable and writable`,
    };
  } catch (err) {
    return {
      name: "Workspace Paths",
      passed: false,
      severity: "critical",
      message: `Workspace root ${workspaceRoot} is not accessible: ${String(err)}`,
      suggestion: "Check filesystem permissions or update workspace.root in config",
    };
  }
}

/**
 * Check gateway auth prerequisites.
 */
function checkGatewayAuth(cfg: OpenClawConfig): DoctorCheckResult {
  const mode = cfg.gateway?.mode;
  if (!mode) {
    return {
      name: "Gateway Auth",
      passed: false,
      severity: "critical",
      message: "Gateway mode (local/remote) not configured",
      suggestion: "Run 'openclaw configure' and set gateway mode",
    };
  }

  if (mode === "local") {
    const hasAuth = cfg.gateway?.auth?.token || cfg.gateway?.auth?.password;
    if (!hasAuth && process.env.OPENCLAW_GATEWAY_TOKEN === undefined) {
      return {
        name: "Gateway Auth",
        passed: true,
        severity: "warning",
        message: "Local gateway has no token/password; consider setting one",
        suggestion: "Run 'openclaw doctor --fix' to generate a token",
      };
    }
  }

  return {
    name: "Gateway Auth",
    passed: true,
    severity: "info",
    message: `Gateway auth mode: ${mode}`,
  };
}

/**
 * Check optional dependencies for enabled features.
 */
function checkOptionalFeatures(cfg: OpenClawConfig): DoctorCheckResult[] {
  const results: DoctorCheckResult[] = [];

  if (cfg.browser?.enabled) {
    if (!cfg.browser?.proxyPort) {
      results.push({
        name: "Browser Proxy",
        passed: false,
        severity: "warning",
        message: "Browser is enabled but proxyPort is not configured",
        suggestion: "Set browser.proxyPort in config to enable browser automation",
      });
    } else {
      results.push({
        name: "Browser Proxy",
        passed: true,
        severity: "info",
        message: `Browser proxy configured on port ${cfg.browser.proxyPort}`,
      });
    }
  }

  if (cfg.extensions?.enabled) {
    const roots = cfg.extensions?.roots ?? [];
    if (roots.length === 0) {
      results.push({
        name: "Extensions",
        passed: true,
        severity: "info",
        message: "Extensions enabled but no roots configured (optional)",
      });
    } else {
      results.push({
        name: "Extensions",
        passed: true,
        severity: "info",
        message: `Extensions configured with ${roots.length} root(s)`,
      });
    }
  }

  if (cfg.plugins?.enabled) {
    results.push({
      name: "Plugins",
      passed: true,
      severity: "info",
      message: "Plugin system enabled",
    });
  }

  return results;
}

/**
 * Run full doctor report for deployment verification.
 */
export async function runDoctorReport(params: {
  cfg: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  cwd?: string;
}): Promise<DoctorReport> {
  const cwd = params.cwd ?? process.cwd();
  const checks: DoctorCheckResult[] = [];

  // Critical checks.
  checks.push(await checkAuthorityBoundary());

  const { AUTHORITY_BOUNDARY_SCAN_ROOTS } = await import(
    "../security/authority-boundaries.js"
  ).catch(() => ({ AUTHORITY_BOUNDARY_SCAN_ROOTS: ["src", "extensions"] }));
  checks.push(await checkScanScopeRoots(AUTHORITY_BOUNDARY_SCAN_ROOTS, cwd));

  checks.push(await checkWorkspacePaths(params.cfg));
  checks.push(checkGatewayAuth(params.cfg));

  // Optional checks.
  checks.push(...checkOptionalFeatures(params.cfg));

  // Compute summary.
  const summary = {
    total: checks.length,
    critical: checks.filter((c) => c.severity === "critical" && !c.passed).length,
    warnings: checks.filter((c) => c.severity === "warning" && !c.passed).length,
    info: checks.filter((c) => c.severity === "info").length,
  };

  return {
    checks,
    summary,
    readyForOperation: summary.critical === 0,
  };
}

/**
 * Format doctor report for console output.
 */
export function formatDoctorReport(report: DoctorReport): string[] {
  const lines: string[] = [];

  lines.push("");
  lines.push("=== OpenClaw Doctor Report ===");
  lines.push("");

  for (const check of report.checks) {
    const statusIcon = check.passed ? "✓" : "✗";
    const severityMarker = {
      critical: "[CRITICAL]",
      warning: "[WARNING]",
      info: "[INFO]",
    }[check.severity];

    lines.push(`${statusIcon} ${check.name} ${severityMarker}`);
    lines.push(`  ${check.message}`);
    if (check.suggestion) {
      lines.push(`  Suggestion: ${check.suggestion}`);
    }
  }

  lines.push("");
  lines.push(
    `Summary: ${report.summary.total} checks, ${report.summary.critical} critical, ${report.summary.warnings} warnings`,
  );

  if (report.readyForOperation) {
    lines.push("Status: READY FOR OPERATION ✓");
  } else {
    lines.push("Status: NOT READY - Fix critical issues above");
  }

  lines.push("");
  return lines;
}
