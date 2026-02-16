/**
 * Network egress policy for tool execution.
 *
 * Default: network denied. Tools must declare network requirements.
 * Even when declared, raw IPs, RFC1918, and link-local ranges are
 * blocked unless explicitly allowed. Domain allowlisting is enforced.
 *
 * NOTE: True kernel-level enforcement (iptables/nsjail) requires
 * container/OS tooling. This module provides software-level policy
 * validation that must be checked before granting network access.
 */

import net from "node:net";
import { URL } from "node:url";

// ── Types ──

export type NetworkEgressDeclaration = {
  enabled: boolean;
  allowDomains?: string[];
  maxBytes?: number;
  maxSeconds?: number;
  allowPrivateRanges?: boolean;
};

export type EgressValidationResult =
  | { ok: true; policy: ResolvedEgressPolicy }
  | { ok: false; reason: string };

export type ResolvedEgressPolicy = {
  enabled: boolean;
  allowDomains: string[];
  denyPrivate: boolean;
  maxBytes: number;
  maxSeconds: number;
};

// ── Defaults ──

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_SECONDS = 30;

export const NETWORK_DENIED_POLICY: Readonly<ResolvedEgressPolicy> = Object.freeze({
  enabled: false,
  allowDomains: [],
  denyPrivate: true,
  maxBytes: 0,
  maxSeconds: 0,
});

// ── Private range detection ──

/** RFC1918, link-local, loopback, and other non-routable ranges. */
const PRIVATE_RANGES = [
  // 10.0.0.0/8
  { start: "10.0.0.0", end: "10.255.255.255" },
  // 172.16.0.0/12
  { start: "172.16.0.0", end: "172.31.255.255" },
  // 192.168.0.0/16
  { start: "192.168.0.0", end: "192.168.255.255" },
  // 169.254.0.0/16 (link-local)
  { start: "169.254.0.0", end: "169.254.255.255" },
  // 127.0.0.0/8 (loopback)
  { start: "127.0.0.0", end: "127.255.255.255" },
];

function ipToLong(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function isPrivateIp(ip: string): boolean {
  if (!net.isIPv4(ip)) {
    // IPv6 — block link-local (fe80::), loopback (::1), ULA (fc00::/7)
    if (ip === "::1") {
      return true;
    }
    const lower = ip.toLowerCase();
    if (lower.startsWith("fe80:")) {
      return true;
    }
    if (lower.startsWith("fc") || lower.startsWith("fd")) {
      return true;
    }
    return false;
  }
  const long = ipToLong(ip);
  for (const range of PRIVATE_RANGES) {
    if (long >= ipToLong(range.start) && long <= ipToLong(range.end)) {
      return true;
    }
  }
  return false;
}

export function isRawIp(host: string): boolean {
  return net.isIPv4(host) || net.isIPv6(host);
}

// ── Domain matching ──

function matchesDomain(hostname: string, allowDomains: string[]): boolean {
  const lower = hostname.toLowerCase();
  for (const domain of allowDomains) {
    if (domain === "*") {
      return true;
    }
    const d = domain.toLowerCase().replace(/^\*\./, "");
    if (lower === d || lower.endsWith("." + d)) {
      return true;
    }
  }
  return false;
}

// ── Policy resolution ──

export function resolveEgressPolicy(
  declaration?: NetworkEgressDeclaration | null,
): ResolvedEgressPolicy {
  if (!declaration || !declaration.enabled) {
    return { ...NETWORK_DENIED_POLICY };
  }
  return {
    enabled: true,
    allowDomains: Array.isArray(declaration.allowDomains)
      ? declaration.allowDomains.filter((d) => typeof d === "string" && d.trim())
      : [],
    denyPrivate: declaration.allowPrivateRanges !== true,
    maxBytes:
      typeof declaration.maxBytes === "number" && declaration.maxBytes > 0
        ? Math.min(declaration.maxBytes, 100 * 1024 * 1024)
        : DEFAULT_MAX_BYTES,
    maxSeconds:
      typeof declaration.maxSeconds === "number" && declaration.maxSeconds > 0
        ? Math.min(declaration.maxSeconds, 300)
        : DEFAULT_MAX_SECONDS,
  };
}

// ── Target validation ──

/**
 * Validate an egress target URL against the resolved policy.
 *
 * Rules:
 * 1. If network not enabled → deny
 * 2. Raw IP targets → deny (unless allowPrivateRanges and private)
 * 3. Private IP ranges → deny (unless allowPrivateRanges)
 * 4. Domain must match allowDomains (suffix match)
 */
export function validateEgressTarget(
  targetUrl: string,
  policy: ResolvedEgressPolicy,
): EgressValidationResult {
  if (!policy.enabled) {
    return { ok: false, reason: "network egress is disabled for this tool" };
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { ok: false, reason: `invalid URL: ${targetUrl}` };
  }

  const hostname = parsed.hostname;

  // Block raw IP targets
  if (isRawIp(hostname)) {
    if (policy.denyPrivate && isPrivateIp(hostname)) {
      return { ok: false, reason: `private IP target denied: ${hostname}` };
    }
    // Even public raw IPs are denied — require DNS
    return { ok: false, reason: `raw IP target denied: ${hostname} (use DNS hostname)` };
  }

  // Domain allowlist check
  if (policy.allowDomains.length > 0) {
    if (!matchesDomain(hostname, policy.allowDomains)) {
      return {
        ok: false,
        reason: `domain not allowlisted: ${hostname}`,
      };
    }
  } else {
    // No domains allowlisted → deny all
    return {
      ok: false,
      reason: "no domains allowlisted in network egress policy",
    };
  }

  return { ok: true, policy };
}

/**
 * Quick check: does the environment support network enforcement?
 * Returns true if running in a container or sandbox that can enforce
 * iptables/nsjail-level network isolation.
 */
export function networkEnforcementSupported(): boolean {
  // Check for common container indicators
  const inDocker =
    process.env.OPENCLAW_SANDBOX === "1" ||
    process.env.container === "docker" ||
    process.env.OPENCLAW_NETWORK_ENFORCEMENT === "1";
  return inDocker;
}
