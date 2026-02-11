import type { RfsnCapability } from "./types.js";

function normalizeCapabilityToken(value: string): string {
  return value.trim().toLowerCase();
}

function toUniqueCapabilities(values: Iterable<string>): RfsnCapability[] {
  return [...new Set([...values].map((value) => normalizeCapabilityToken(value)).filter(Boolean))];
}

function hasToken(tokens: Set<string>, value: string): boolean {
  return tokens.has(value.toLowerCase());
}

function envFlagEnabled(name: string): boolean {
  const normalized = String(process.env[name] ?? "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function resolveRfsnRuntimeCapabilities(params: {
  sandboxed: boolean;
  channelCapabilities?: string[];
  messageToolEnabled?: boolean;
}): RfsnCapability[] {
  const caps = new Set<string>();
  if (params.sandboxed) {
    caps.add("proc:manage");
  }

  const channelTokens = new Set(
    (params.channelCapabilities ?? [])
      .map((value) => normalizeCapabilityToken(String(value)))
      .filter(Boolean),
  );

  if (params.messageToolEnabled !== false && channelTokens.size > 0) {
    caps.add("net:messaging");
  }
  if (
    hasToken(channelTokens, "inlinebuttons") ||
    hasToken(channelTokens, "inlinebutton") ||
    hasToken(channelTokens, "buttons")
  ) {
    caps.add("net:messaging:inlinebuttons");
  }
  if (hasToken(channelTokens, "tts") || hasToken(channelTokens, "voice")) {
    caps.add("net:tts");
  }
  if (hasToken(channelTokens, "search") || hasToken(channelTokens, "websearch")) {
    caps.add("net:search");
  }
  if (envFlagEnabled("OPENCLAW_BROWSER_ALLOW_UNSAFE_EVAL")) {
    caps.add("browser:unsafe_eval");
  }

  return toUniqueCapabilities(caps);
}
