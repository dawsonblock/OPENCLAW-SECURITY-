import type { Api, Model } from "@mariozechner/pi-ai";

function isOpenAiCompletionsModel(model: Model<Api>): model is Model<"openai-completions"> {
  return model.api === "openai-completions";
}

/**
 * Native OpenAI endpoints that support the `developer` role in chat completions.
 * All other openai-completions-compatible endpoints (Ollama, GitHub Models,
 * Azure inference, Together, Groq, etc.) do NOT support it and must use `system`.
 * GitHub Copilot uses openai-responses (not openai-completions), so it never
 * reaches this guard — but we list it explicitly for safety.
 */
const NATIVE_OPENAI_HOSTS = [
  "api.openai.com",
  "api.openai.azure.com",
  "api.githubcopilot.com",
];

function isNativeOpenAiEndpoint(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl);
    return NATIVE_OPENAI_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export function normalizeModelCompat(model: Model<Api>): Model<Api> {
  if (!isOpenAiCompletionsModel(model)) {
    return model;
  }
  const baseUrl = model.baseUrl ?? "";
  // Only native OpenAI endpoints support the 'developer' role.
  // Force it off for all third-party openai-completions providers.
  if (isNativeOpenAiEndpoint(baseUrl)) {
    return model;
  }
  const openaiModel = model;
  const compat = openaiModel.compat ?? undefined;
  if (compat?.supportsDeveloperRole === false) {
    return model; // already set
  }
  openaiModel.compat = compat
    ? { ...compat, supportsDeveloperRole: false }
    : { supportsDeveloperRole: false };
  return openaiModel;
}
