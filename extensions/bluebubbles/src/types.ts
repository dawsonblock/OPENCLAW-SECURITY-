import type { DmPolicy, GroupPolicy } from "openclaw/plugin-sdk";
export type { DmPolicy, GroupPolicy };

export type BlueBubblesGroupConfig = {
  /** If true, only respond in this group when mentioned. */
  requireMention?: boolean;
  /** Optional tool policy overrides for this group. */
  tools?: { allow?: string[]; deny?: string[] };
};

export type BlueBubblesAccountConfig = {
  /** Optional display name for this account (used in CLI/UI lists). */
  name?: string;
  /** Optional provider capability tags used for agent/runtime guidance. */
  capabilities?: string[];
  /** Allow channel-initiated config writes (default: true). */
  configWrites?: boolean;
  /** If false, do not start this BlueBubbles account. Default: true. */
  enabled?: boolean;
  /** Base URL for the BlueBubbles API. */
  serverUrl?: string;
  /** Password for BlueBubbles API authentication. */
  password?: string;
  /** Webhook path for the gateway HTTP server. */
  webhookPath?: string;
  /** Direct message access policy (default: pairing). */
  dmPolicy?: DmPolicy;
  allowFrom?: Array<string | number>;
  /** Optional allowlist for group senders. */
  groupAllowFrom?: Array<string | number>;
  /** Group message handling policy. */
  groupPolicy?: GroupPolicy;
  /** Max group messages to keep as history context (0 disables). */
  historyLimit?: number;
  /** Max DM turns to keep as history context. */
  dmHistoryLimit?: number;
  /** Per-DM config overrides keyed by user ID. */
  dms?: Record<string, unknown>;
  /** Outbound text chunk size (chars). Default: 4000. */
  textChunkLimit?: number;
  /** Chunking mode: "newline" (default) splits on every newline; "length" splits by size. */
  chunkMode?: "length" | "newline";
  blockStreaming?: boolean;
  /** Merge streamed block replies before sending. */
  blockStreamingCoalesce?: Record<string, unknown>;
  /** Max outbound media size in MB. */
  mediaMaxMb?: number;
  /** Send read receipts for incoming messages (default: true). */
  sendReadReceipts?: boolean;
  /** Per-group configuration keyed by chat GUID or identifier. */
  groups?: Record<string, BlueBubblesGroupConfig>;
};

export type BlueBubblesActionConfig = {
  reactions?: boolean;
  edit?: boolean;
  unsend?: boolean;
  reply?: boolean;
  sendWithEffect?: boolean;
  renameGroup?: boolean;
  addParticipant?: boolean;
  removeParticipant?: boolean;
  leaveGroup?: boolean;
  sendAttachment?: boolean;
};

export type BlueBubblesConfig = {
  /** Optional per-account BlueBubbles configuration (multi-account). */
  accounts?: Record<string, BlueBubblesAccountConfig>;
  /** Per-action tool gating (default: true for all). */
  actions?: BlueBubblesActionConfig;
} & BlueBubblesAccountConfig;

export type BlueBubblesSendTarget =
  | { kind: "chat_id"; chatId: number }
  | { kind: "chat_guid"; chatGuid: string }
  | { kind: "chat_identifier"; chatIdentifier: string }
  | { kind: "handle"; address: string; service?: "imessage" | "sms" | "auto" };

export type BlueBubblesAttachment = {
  guid?: string;
  uti?: string;
  mimeType?: string;
  transferName?: string;
  totalBytes?: number;
  height?: number;
  width?: number;
  originalROWID?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const LEGACY_QUERY_AUTH_ENV = "OPENCLAW_BLUEBUBBLES_LEGACY_QUERY_AUTH";

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(headers)) {
    const result: Record<string, string> = {};
    for (const [key, value] of headers) {
      result[key] = value;
    }
    return result;
  }
  return { ...headers };
}

function hasHeaderCaseInsensitive(headers: Record<string, string>, name: string): boolean {
  const lowered = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lowered);
}

export function normalizeBlueBubblesServerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("BlueBubbles serverUrl is required");
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withScheme.replace(/\/+$/, "");
}

export function buildBlueBubblesApiUrl(params: {
  baseUrl: string;
  path: string;
  password?: string;
}): string {
  const normalized = normalizeBlueBubblesServerUrl(params.baseUrl);
  const url = new URL(params.path, `${normalized}/`);
  const allowLegacyQueryAuth = process.env[LEGACY_QUERY_AUTH_ENV] === "1";
  if (params.password && allowLegacyQueryAuth) {
    url.searchParams.set("password", params.password);
  }
  return url.toString();
}

type BlueBubblesFetchInit = RequestInit & {
  blueBubblesPassword?: string;
};

export async function blueBubblesFetchWithTimeout(
  url: string,
  init: BlueBubblesFetchInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  const { blueBubblesPassword, ...requestInit } = init;
  const parsedUrl = new URL(url);
  const queryPassword = parsedUrl.searchParams.get("password")?.trim();
  const allowLegacyQueryAuth = process.env[LEGACY_QUERY_AUTH_ENV] === "1";
  if (queryPassword && !allowLegacyQueryAuth) {
    parsedUrl.searchParams.delete("password");
  }
  const authPassword = blueBubblesPassword?.trim() || queryPassword;

  const authHeaders = headersToRecord(requestInit.headers);
  if (authPassword) {
    if (!hasHeaderCaseInsensitive(authHeaders, "authorization")) {
      authHeaders.Authorization = `Bearer ${authPassword}`;
    }
    if (!hasHeaderCaseInsensitive(authHeaders, "x-bluebubbles-password")) {
      authHeaders["X-BlueBubbles-Password"] = authPassword;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(parsedUrl.toString(), {
      ...requestInit,
      headers: authHeaders,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
