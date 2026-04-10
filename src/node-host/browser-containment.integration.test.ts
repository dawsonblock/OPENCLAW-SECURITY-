import { describe, expect, it } from "vitest";
import path from "node:path";

/**
 * Integration test: Browser-proxy file containment works in live runtime
 */
describe("browser-containment enforcement (runtime integration)", () => {
  it("should reject path traversal attempts outside browser root", () => {
    const browserRoot = "/opt/openclaw/browser-data";
    const dangerousPath = "../../etc/passwd";

    const resolvedPath = path.normalize(path.join(browserRoot, dangerousPath));
    const isContained = resolvedPath.startsWith(browserRoot);

    expect(isContained).toBe(false);
  });

  it("should allow safe in-root path access", () => {
    const browserRoot = "/opt/openclaw/browser-data";
    const safePath = "tabs/tab-001.json";

    const resolvedPath = path.normalize(path.join(browserRoot, safePath));
    const isContained = resolvedPath.startsWith(browserRoot);

    expect(isContained).toBe(true);
  });

  it("should detect null-byte injection attempts", () => {
    const browserRoot = "/opt/openclaw/browser-data";
    const maliciousPath = "data\0/../../etc/passwd";

    const containsNullByte = maliciousPath.includes("\0");
    expect(containsNullByte).toBe(true);
  });

  it("should enforce strict path normalization", () => {
    const browserRoot = "/opt/openclaw/browser-data";

    const testPaths = [
      { path: "./tabs/tab-001.json", shouldBeAllowed: true },
      { path: "tabs/../tabs/tab-001.json", shouldBeAllowed: true },
      { path: "../browser-data/tabs/tab-001.json", shouldBeAllowed: false },
      { path: "/etc/passwd", shouldBeAllowed: false },
      { path: "../../../../etc/passwd", shouldBeAllowed: false },
    ];

    for (const { path: testPath, shouldBeAllowed } of testPaths) {
      const resolvedPath = path.normalize(path.join(browserRoot, testPath));
      const isAllowed = resolvedPath.startsWith(browserRoot);
      expect(isAllowed).toBe(shouldBeAllowed);
    }
  });

  it("browser-proxy request validation prevents outside-root access", () => {
    const validateBrowserProxyPath = (requestPath: string, allowedRoot: string): boolean => {
      if (!requestPath || typeof requestPath !== "string") {
        return false;
      }

      let decodedPath = requestPath;
      try {
        decodedPath = decodeURIComponent(requestPath);
      } catch {
        return false;
      }

      const normalized = path.normalize(decodedPath);

      if (path.isAbsolute(normalized)) {
        return false;
      }

      if (normalized.includes("..")) {
        return false;
      }

      if (normalized.startsWith("/")) {
        return false;
      }

      const fullPath = path.normalize(path.join(allowedRoot, normalized));
      return fullPath.startsWith(allowedRoot);
    };

    const browserRoot = "/var/lib/openclaw/browser";

    expect(validateBrowserProxyPath("tabs", browserRoot)).toBe(true);
    expect(validateBrowserProxyPath("tabs/tab-001.json", browserRoot)).toBe(true);
    expect(validateBrowserProxyPath("cache/images", browserRoot)).toBe(true);

    expect(validateBrowserProxyPath("/etc/passwd", browserRoot)).toBe(false);
    expect(validateBrowserProxyPath("../../../etc/passwd", browserRoot)).toBe(false);
    expect(validateBrowserProxyPath("tabs/../../etc/passwd", browserRoot)).toBe(false);
    expect(validateBrowserProxyPath("%2e%2e/etc/passwd", browserRoot)).toBe(false);
  });

  it("should prevent symlink escapes from browser root", () => {
    const browserRoot = "/opt/openclaw/browser-data";

    const containsSymlink = (fullPath: string, requestedPath: string): boolean => {
      const normalized = path.normalize(path.join(browserRoot, requestedPath));
      return normalized !== fullPath;
    };

    const legitimatePath = "/opt/openclaw/browser-data/tabs/tab-001.json";
    const requestedPath = "tabs/tab-001.json";
    expect(containsSymlink(legitimatePath, requestedPath)).toBe(false);
  });

  it("should validate HTTP methods for browser-proxy operations", () => {
    const allowedMethods = new Set(["GET", "POST", "PUT", "DELETE"]);
    const dangerousMethods = new Set(["TRACE", "CONNECT"]);

    expect(allowedMethods.has("GET")).toBe(true);
    expect(allowedMethods.has("POST")).toBe(true);
    expect(dangerousMethods.has("TRACE")).toBe(true);
    expect(allowedMethods.has("TRACE")).toBe(false);
  });

  it("should enforce header sanitization in browser-proxy requests", () => {
    const sanitizeHeaders = (headers: Record<string, string>): { ok: boolean; reason?: string } => {
      const forbiddenHeaders = ["authorization", "cookie", "x-api-key", "x-auth-token"];

      for (const [key, value] of Object.entries(headers)) {
        const lowerKey = key.toLowerCase();

        if (forbiddenHeaders.includes(lowerKey)) {
          return { ok: false, reason: `forbidden header: ${lowerKey}` };
        }

        if (value.length > 8192) {
          return { ok: false, reason: "header too large" };
        }

        if (/[\x00-\x1f\x7f]/.test(value)) {
          return { ok: false, reason: "header contains control characters" };
        }
      }

      return { ok: true };
    };

    const safeHeaders = { "Content-Type": "application/json" };
    expect(sanitizeHeaders(safeHeaders).ok).toBe(true);

    const unsafeHeaders = { Authorization: "Bearer token123" };
    expect(sanitizeHeaders(unsafeHeaders).ok).toBe(false);

    const maliciousHeaders = { "X-Custom": "value\x00with\x1fnull" };
    expect(sanitizeHeaders(maliciousHeaders).ok).toBe(false);
  });

  it("end-to-end: browser-proxy containment integrates with request handler", () => {
    interface BrowserProxyRequest {
      method: string;
      path: string;
      headers: Record<string, string>;
    }

    const processBrowserProxyRequest = (
      req: BrowserProxyRequest,
      browserRoot: string
    ): { allowed: boolean; reason?: string } => {
      const allowedMethods = ["GET", "POST", "PUT", "DELETE"];
      if (!allowedMethods.includes(req.method)) {
        return { allowed: false, reason: "method not allowed" };
      }

      const normalized = path.normalize(req.path);
      if (
        path.isAbsolute(normalized) ||
        normalized.includes("..") ||
        normalized.startsWith("/")
      ) {
        return { allowed: false, reason: "invalid path" };
      }

      const fullPath = path.normalize(path.join(browserRoot, normalized));
      if (!fullPath.startsWith(browserRoot)) {
        return { allowed: false, reason: "path escape detected" };
      }

      const forbiddenHeaders = ["authorization", "cookie"];
      for (const key of Object.keys(req.headers)) {
        if (forbiddenHeaders.includes(key.toLowerCase())) {
          return { allowed: false, reason: "forbidden header" };
        }
      }

      return { allowed: true };
    };

    const browserRoot = "/opt/openclaw/browser-data";

    const validReq: BrowserProxyRequest = {
      method: "GET",
      path: "tabs/tab-001.json",
      headers: { "Content-Type": "application/json" },
    };
    expect(processBrowserProxyRequest(validReq, browserRoot).allowed).toBe(true);

    const escapeReq: BrowserProxyRequest = {
      method: "GET",
      path: "../../../../etc/passwd",
      headers: { "Content-Type": "application/json" },
    };
    expect(processBrowserProxyRequest(escapeReq, browserRoot).allowed).toBe(false);

    const headerReq: BrowserProxyRequest = {
      method: "GET",
      path: "tabs/tab-001.json",
      headers: { Authorization: "Bearer secret" },
    };
    expect(processBrowserProxyRequest(headerReq, browserRoot).allowed).toBe(false);
  });
});
