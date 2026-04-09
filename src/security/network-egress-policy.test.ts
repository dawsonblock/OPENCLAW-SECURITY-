import { describe, expect, test } from "vitest";
import {
  isPrivateIp,
  isRawIp,
  NETWORK_DENIED_POLICY,
  resolveEgressPolicy,
  validateEgressTarget,
} from "./network-egress-policy.js";

describe("network-egress-policy", () => {
  describe("isPrivateIp", () => {
    test("detects RFC1918 ranges", () => {
      expect(isPrivateIp("10.0.0.1")).toBe(true);
      expect(isPrivateIp("172.16.0.1")).toBe(true);
      expect(isPrivateIp("192.168.1.1")).toBe(true);
    });

    test("detects link-local", () => {
      expect(isPrivateIp("169.254.0.1")).toBe(true);
    });

    test("detects loopback", () => {
      expect(isPrivateIp("127.0.0.1")).toBe(true);
      expect(isPrivateIp("::1")).toBe(true);
    });

    test("rejects public IPs", () => {
      expect(isPrivateIp("8.8.8.8")).toBe(false);
      expect(isPrivateIp("1.1.1.1")).toBe(false);
    });

    test("detects IPv6 ULA", () => {
      expect(isPrivateIp("fc00::1")).toBe(true);
      expect(isPrivateIp("fd12:3456::1")).toBe(true);
    });

    test("detects IPv6 link-local", () => {
      expect(isPrivateIp("fe80::1")).toBe(true);
    });
  });

  describe("isRawIp", () => {
    test("detects IPv4", () => {
      expect(isRawIp("192.168.1.1")).toBe(true);
    });
    test("detects IPv6", () => {
      expect(isRawIp("::1")).toBe(true);
    });
    test("rejects hostnames", () => {
      expect(isRawIp("example.com")).toBe(false);
    });
  });

  describe("resolveEgressPolicy", () => {
    test("returns denied policy when no declaration", () => {
      expect(resolveEgressPolicy(null)).toEqual(NETWORK_DENIED_POLICY);
      expect(resolveEgressPolicy(undefined)).toEqual(NETWORK_DENIED_POLICY);
    });

    test("returns denied policy when enabled=false", () => {
      expect(resolveEgressPolicy({ enabled: false })).toEqual(NETWORK_DENIED_POLICY);
    });

    test("resolves with defaults when enabled", () => {
      const policy = resolveEgressPolicy({ enabled: true, allowDomains: ["example.com"] });
      expect(policy.enabled).toBe(true);
      expect(policy.denyPrivate).toBe(true);
      expect(policy.maxBytes).toBe(10 * 1024 * 1024);
      expect(policy.maxSeconds).toBe(30);
    });

    test("caps maxBytes at 100 MB", () => {
      const policy = resolveEgressPolicy({
        enabled: true,
        allowDomains: ["*"],
        maxBytes: 999_999_999_999,
      });
      expect(policy.maxBytes).toBe(100 * 1024 * 1024);
    });
  });

  describe("validateEgressTarget", () => {
    const allowedPolicy = resolveEgressPolicy({
      enabled: true,
      allowDomains: ["example.com", "*.github.com"],
    });

    test("denies when network disabled", () => {
      const result = validateEgressTarget("https://example.com", NETWORK_DENIED_POLICY);
      expect(result.ok).toBe(false);
    });

    test("allows allowlisted domain", () => {
      const result = validateEgressTarget("https://example.com/path", allowedPolicy);
      expect(result.ok).toBe(true);
    });

    test("allows subdomain via wildcard", () => {
      const result = validateEgressTarget("https://api.github.com/repos", allowedPolicy);
      expect(result.ok).toBe(true);
    });

    test("denies non-allowlisted domain", () => {
      const result = validateEgressTarget("https://evil.com", allowedPolicy);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("not allowlisted");
      }
    });

    test("denies raw IP targets", () => {
      const result = validateEgressTarget("http://8.8.8.8/path", allowedPolicy);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("raw IP");
      }
    });

    test("denies private IP targets", () => {
      const result = validateEgressTarget("http://192.168.1.1", allowedPolicy);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("private IP");
      }
    });

    test("denies loopback IP", () => {
      const result = validateEgressTarget("http://127.0.0.1:3000", allowedPolicy);
      expect(result.ok).toBe(false);
    });

    test("denies invalid URL", () => {
      const result = validateEgressTarget("not-a-url", allowedPolicy);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("invalid URL");
      }
    });

    test("denies when no domains allowlisted", () => {
      const emptyPolicy = resolveEgressPolicy({ enabled: true, allowDomains: [] });
      const result = validateEgressTarget("https://example.com", emptyPolicy);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("no domains allowlisted");
      }
    });
  });
});
