import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatOctal,
  formatPermissionDetail,
  formatPermissionRemediation,
  inspectPathPermissions,
  isGroupReadable,
  isGroupWritable,
  isWorldReadable,
  isWorldWritable,
  modeBits,
  safeStat,
} from "./audit-fs.js";

describe("modeBits", () => {
  it("extracts the permission bits from a full mode", () => {
    // 0o100644: regular file with rw-r--r--
    expect(modeBits(0o100644)).toBe(0o644);
  });

  it("returns null for null input", () => {
    expect(modeBits(null)).toBeNull();
  });

  it("handles directory mode", () => {
    // 0o040755: directory with rwxr-xr-x
    expect(modeBits(0o040755)).toBe(0o755);
  });
});

describe("formatOctal", () => {
  it("formats bits as 3-digit octal string", () => {
    expect(formatOctal(0o644)).toBe("644");
    expect(formatOctal(0o755)).toBe("755");
    expect(formatOctal(0o700)).toBe("700");
  });

  it("pads single-digit values", () => {
    expect(formatOctal(0o007)).toBe("007");
    expect(formatOctal(0o077)).toBe("077");
  });

  it("returns 'unknown' for null input", () => {
    expect(formatOctal(null)).toBe("unknown");
  });
});

describe("isWorldWritable", () => {
  it("returns true when world-write bit is set", () => {
    expect(isWorldWritable(0o002)).toBe(true);
    expect(isWorldWritable(0o777)).toBe(true);
    expect(isWorldWritable(0o666)).toBe(true);
  });

  it("returns false when world-write bit is not set", () => {
    expect(isWorldWritable(0o644)).toBe(false);
    expect(isWorldWritable(0o755)).toBe(false);
    expect(isWorldWritable(0o700)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isWorldWritable(null)).toBe(false);
  });
});

describe("isGroupWritable", () => {
  it("returns true when group-write bit is set", () => {
    expect(isGroupWritable(0o020)).toBe(true);
    expect(isGroupWritable(0o660)).toBe(true);
    expect(isGroupWritable(0o777)).toBe(true);
  });

  it("returns false when group-write bit is not set", () => {
    expect(isGroupWritable(0o644)).toBe(false);
    expect(isGroupWritable(0o755)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isGroupWritable(null)).toBe(false);
  });
});

describe("isWorldReadable", () => {
  it("returns true when world-read bit is set", () => {
    expect(isWorldReadable(0o004)).toBe(true);
    expect(isWorldReadable(0o644)).toBe(true);
    expect(isWorldReadable(0o777)).toBe(true);
  });

  it("returns false when world-read bit is not set", () => {
    expect(isWorldReadable(0o600)).toBe(false);
    expect(isWorldReadable(0o700)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isWorldReadable(null)).toBe(false);
  });
});

describe("isGroupReadable", () => {
  it("returns true when group-read bit is set", () => {
    expect(isGroupReadable(0o040)).toBe(true);
    expect(isGroupReadable(0o644)).toBe(true);
    expect(isGroupReadable(0o777)).toBe(true);
  });

  it("returns false when group-read bit is not set", () => {
    expect(isGroupReadable(0o600)).toBe(false);
    expect(isGroupReadable(0o700)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isGroupReadable(null)).toBe(false);
  });
});

describe("safeStat", () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-fs-test-"));
    tmpFile = path.join(tmpDir, "test.txt");
    await fs.writeFile(tmpFile, "hello");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns ok=true for an existing file", async () => {
    const result = await safeStat(tmpFile);
    expect(result.ok).toBe(true);
    expect(result.isDir).toBe(false);
    expect(result.isSymlink).toBe(false);
    expect(result.mode).toBeTypeOf("number");
  });

  it("returns ok=true for a directory", async () => {
    const result = await safeStat(tmpDir);
    expect(result.ok).toBe(true);
    expect(result.isDir).toBe(true);
  });

  it("returns ok=false for a nonexistent path", async () => {
    const result = await safeStat(path.join(tmpDir, "does-not-exist.txt"));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ENOENT/);
  });

  it("returns ok=true for a symlink (pointing at its target)", async () => {
    const linkPath = path.join(tmpDir, "link.txt");
    await fs.symlink(tmpFile, linkPath);
    const result = await safeStat(linkPath);
    expect(result.ok).toBe(true);
    expect(result.isSymlink).toBe(true);
  });
});

describe("inspectPathPermissions", () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-fs-perms-"));
    tmpFile = path.join(tmpDir, "test.txt");
    await fs.writeFile(tmpFile, "data");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns ok=false for a missing path", async () => {
    const result = await inspectPathPermissions(path.join(tmpDir, "missing"), {
      platform: "linux",
    });
    expect(result.ok).toBe(false);
    expect(result.source).toBe("unknown");
  });

  it("detects posix permissions on linux", async () => {
    const result = await inspectPathPermissions(tmpFile, { platform: "linux" });
    expect(result.ok).toBe(true);
    expect(result.source).toBe("posix");
    expect(result.bits).toBeTypeOf("number");
  });

  it("detects posix permissions on darwin", async () => {
    const result = await inspectPathPermissions(tmpFile, { platform: "darwin" });
    expect(result.ok).toBe(true);
    expect(result.source).toBe("posix");
  });

  it("returns windows-acl source on win32 when exec is provided", async () => {
    // Mock a successful icacls response indicating no world-writable ACL entries
    const mockExec = vi.fn().mockResolvedValue({
      stdout:
        "NT AUTHORITY\\SYSTEM:(I)(F)\r\nBUILTIN\\Administrators:(I)(F)\r\nBUILTIN\\Users:(I)(RX)\r\n\r\nSuccessfully processed 1 files; Failed processing 0 files",
      stderr: "",
    });
    const result = await inspectPathPermissions(tmpFile, {
      platform: "win32",
      exec: mockExec,
    });
    expect(result.ok).toBe(true);
    expect(result.source).toBe("windows-acl");
    expect(result.worldWritable).toBe(false);
  });

  it("reports worldWritable=true when world-write bit is set on posix", async () => {
    // chmod 0o666 so the file is world-writable
    if (process.platform !== "win32") {
      await fs.chmod(tmpFile, 0o666);
    }
    const result = await inspectPathPermissions(tmpFile, { platform: "linux" });
    if (process.platform !== "win32") {
      expect(result.worldWritable).toBe(true);
    }
  });
});

describe("formatPermissionDetail", () => {
  it("formats posix mode as octal", () => {
    const perms = {
      ok: true,
      isSymlink: false,
      isDir: false,
      mode: 0o100644,
      bits: 0o644,
      source: "posix" as const,
      worldWritable: false,
      groupWritable: false,
      worldReadable: true,
      groupReadable: true,
    };
    expect(formatPermissionDetail("/some/file", perms)).toBe("/some/file mode=644");
  });

  it("formats windows-acl source with acl summary", () => {
    const perms = {
      ok: true,
      isSymlink: false,
      isDir: false,
      mode: null,
      bits: null,
      source: "windows-acl" as const,
      worldWritable: false,
      groupWritable: false,
      worldReadable: false,
      groupReadable: false,
      aclSummary: "world:read",
    };
    expect(formatPermissionDetail("C:\\file", perms)).toBe("C:\\file acl=world:read");
  });

  it("falls back to 'unknown' acl summary if not present", () => {
    const perms = {
      ok: true,
      isSymlink: false,
      isDir: false,
      mode: null,
      bits: null,
      source: "windows-acl" as const,
      worldWritable: false,
      groupWritable: false,
      worldReadable: false,
      groupReadable: false,
    };
    expect(formatPermissionDetail("C:\\file", perms)).toBe("C:\\file acl=unknown");
  });
});

describe("formatPermissionRemediation", () => {
  const basePermsPostix = {
    ok: true,
    isSymlink: false,
    isDir: false,
    mode: 0o100644,
    bits: 0o644,
    source: "posix" as const,
    worldWritable: false,
    groupWritable: false,
    worldReadable: true,
    groupReadable: true,
  };

  it("returns a chmod command for posix paths", () => {
    const result = formatPermissionRemediation({
      targetPath: "/home/user/.config",
      perms: basePermsPostix,
      isDir: true,
      posixMode: 0o700,
    });
    expect(result).toBe("chmod 700 /home/user/.config");
  });

  it("pads octal mode correctly", () => {
    const result = formatPermissionRemediation({
      targetPath: "/file",
      perms: basePermsPostix,
      isDir: false,
      posixMode: 0o600,
    });
    expect(result).toBe("chmod 600 /file");
  });

  it("returns an icacls command for windows-acl paths", () => {
    const winPerms = {
      ...basePermsPostix,
      source: "windows-acl" as const,
    };
    const result = formatPermissionRemediation({
      targetPath: "C:\\Users\\user\\.openclaw",
      perms: winPerms,
      isDir: true,
      posixMode: 0o700,
    });
    // Should reference icacls
    expect(result).toMatch(/icacls/i);
  });
});
