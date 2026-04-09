import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTHORITY_BOUNDARY_SCAN_ROOTS,
  AUTHORITY_EXCEPTION_TARGETS,
  FORBIDDEN_AUTHORITY_IMPORT_ROOTS,
  REVIEWED_AUTHORITY_IMPORTERS,
  REVIEWED_CHILD_PROCESS_IMPORTERS,
  normalizeAuthorityBoundaryPath,
  toAuthorityBoundaryRepoPath,
} from "./authority-boundaries.js";

describe("normalizeAuthorityBoundaryPath", () => {
  it("leaves a forward-slash path unchanged", () => {
    expect(normalizeAuthorityBoundaryPath("src/security/subprocess.ts")).toBe(
      "src/security/subprocess.ts",
    );
  });

  it("replaces the platform separator with forward slashes", () => {
    // The function replaces path.sep, so construct a path using the platform separator
    const platformPath = ["src", "security", "subprocess.ts"].join(path.sep);
    expect(normalizeAuthorityBoundaryPath(platformPath)).toBe("src/security/subprocess.ts");
  });

  it("is a no-op on a path already using forward slashes on non-Windows", () => {
    const fwdPath = "src/security/subprocess.ts";
    // forward-slash paths stay unchanged regardless of platform
    expect(normalizeAuthorityBoundaryPath(fwdPath)).toBe("src/security/subprocess.ts");
  });

  it("returns an empty string unchanged", () => {
    expect(normalizeAuthorityBoundaryPath("")).toBe("");
  });
});

describe("toAuthorityBoundaryRepoPath", () => {
  it("converts an absolute path to a repo-relative forward-slash path", () => {
    const cwd = "/home/user/myrepo";
    const absPath = "/home/user/myrepo/src/security/subprocess.ts";
    expect(toAuthorityBoundaryRepoPath(absPath, cwd)).toBe("src/security/subprocess.ts");
  });

  it("uses process.cwd() when no cwd is provided", () => {
    const absPath = path.resolve(process.cwd(), "src/security/subprocess.ts");
    const result = toAuthorityBoundaryRepoPath(absPath);
    expect(result).toBe("src/security/subprocess.ts");
  });

  it("normalises separators to forward slashes", () => {
    // Construct a platform path, then force Windows-style separators in the cwd
    const cwd = "/repo";
    const absPath = "/repo/src/security/subprocess.ts";
    const result = toAuthorityBoundaryRepoPath(absPath, cwd);
    expect(result).not.toContain("\\");
  });
});

describe("AUTHORITY_BOUNDARY_SCAN_ROOTS", () => {
  it("includes 'src' and 'extensions'", () => {
    expect(AUTHORITY_BOUNDARY_SCAN_ROOTS).toContain("src");
    expect(AUTHORITY_BOUNDARY_SCAN_ROOTS).toContain("extensions");
  });
});

describe("REVIEWED_CHILD_PROCESS_IMPORTERS", () => {
  it("includes the subprocess authority wrapper", () => {
    expect(REVIEWED_CHILD_PROCESS_IMPORTERS).toContain("src/security/subprocess.ts");
  });

  it("includes spawn-utils", () => {
    expect(REVIEWED_CHILD_PROCESS_IMPORTERS).toContain("src/process/spawn-utils.ts");
  });

  it("includes the entry point", () => {
    expect(REVIEWED_CHILD_PROCESS_IMPORTERS).toContain("src/entry.ts");
  });
});

describe("REVIEWED_AUTHORITY_IMPORTERS", () => {
  it("has an entry for spawn-utils with expected importers", () => {
    const importers = REVIEWED_AUTHORITY_IMPORTERS["src/process/spawn-utils.ts"];
    expect(importers).toContain("src/agents/bash-tools.exec.runtime.ts");
    expect(importers).toContain("src/process/exec.ts");
  });

  it("has an entry for tui-local-shell", () => {
    const importers = REVIEWED_AUTHORITY_IMPORTERS["src/tui/tui-local-shell.ts"];
    expect(importers).toContain("src/tui/tui.ts");
  });

  it("has an entry for src/entry.ts with empty importers", () => {
    const importers = REVIEWED_AUTHORITY_IMPORTERS["src/entry.ts"];
    expect(Array.isArray(importers)).toBe(true);
    expect(importers).toHaveLength(0);
  });
});

describe("AUTHORITY_EXCEPTION_TARGETS", () => {
  it("is a non-empty array of string paths", () => {
    expect(AUTHORITY_EXCEPTION_TARGETS.length).toBeGreaterThan(0);
    for (const target of AUTHORITY_EXCEPTION_TARGETS) {
      expect(typeof target).toBe("string");
    }
  });

  it("contains all keys from REVIEWED_AUTHORITY_IMPORTERS", () => {
    for (const key of Object.keys(REVIEWED_AUTHORITY_IMPORTERS)) {
      expect(AUTHORITY_EXCEPTION_TARGETS).toContain(key);
    }
  });
});

describe("FORBIDDEN_AUTHORITY_IMPORT_ROOTS", () => {
  it("contains the gateway, node-host, rfsn, and tools roots", () => {
    expect(FORBIDDEN_AUTHORITY_IMPORT_ROOTS).toContain("src/gateway/");
    expect(FORBIDDEN_AUTHORITY_IMPORT_ROOTS).toContain("src/node-host/");
    expect(FORBIDDEN_AUTHORITY_IMPORT_ROOTS).toContain("src/rfsn/");
    expect(FORBIDDEN_AUTHORITY_IMPORT_ROOTS).toContain("src/agents/tools/");
  });
});
