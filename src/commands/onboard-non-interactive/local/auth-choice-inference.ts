import type { OnboardOptions } from "../../onboard-types.js";

export function inferAuthChoiceFromFlags(opts: OnboardOptions): {
  matches: Array<{ label: string; value: string }>;
  choice?: string;
} {
  const matches: Array<{ label: string; value: string }> = [];

  if (opts.anthropicApiKey) {
    matches.push({ label: "--anthropic-api-key", value: "anthropic-api-key" });
  }
  if (opts.openaiApiKey) {
    matches.push({ label: "--openai-api-key", value: "openai-api-key" });
  }
  if (opts.openrouterApiKey) {
    matches.push({ label: "--openrouter-api-key", value: "openrouter-api-key" });
  }
  if (opts.aiGatewayApiKey) {
    matches.push({ label: "--ai-gateway-api-key", value: "ai-gateway-api-key" });
  }
  if (opts.cloudflareAiGatewayApiKey) {
    matches.push({
      label: "--cloudflare-ai-gateway-api-key",
      value: "cloudflare-ai-gateway-api-key",
    });
  }
  if (opts.moonshotApiKey) {
    matches.push({ label: "--moonshot-api-key", value: "moonshot-api-key" });
  }
  if (opts.kimiCodeApiKey) {
    matches.push({ label: "--kimi-code-api-key", value: "kimi-code-api-key" });
  }
  if (opts.geminiApiKey) {
    matches.push({ label: "--gemini-api-key", value: "gemini-api-key" });
  }
  if (opts.zaiApiKey) {
    matches.push({ label: "--zai-api-key", value: "zai-api-key" });
  }
  if (opts.xiaomiApiKey) {
    matches.push({ label: "--xiaomi-api-key", value: "xiaomi-api-key" });
  }
  if (opts.minimaxApiKey) {
    matches.push({ label: "--minimax-api-key", value: "minimax-api-key" });
  }
  if (opts.syntheticApiKey) {
    matches.push({ label: "--synthetic-api-key", value: "synthetic-api-key" });
  }
  if (opts.veniceApiKey) {
    matches.push({ label: "--venice-api-key", value: "venice-api-key" });
  }
  if (opts.togetherApiKey) {
    matches.push({ label: "--together-api-key", value: "together-api-key" });
  }
  if (opts.opencodeZenApiKey) {
    matches.push({ label: "--opencode-zen-api-key", value: "opencode-zen" });
  }
  if (opts.xaiApiKey) {
    matches.push({ label: "--xai-api-key", value: "xai-api-key" });
  }
  if (opts.qianfanApiKey) {
    matches.push({ label: "--qianfan-api-key", value: "qianfan-api-key" });
  }

  let choice = opts.authChoice;
  if (!choice && matches.length === 1) {
    choice = matches[0]!.value;
  }

  if (opts.authChoice) {
    matches.length = 0;
    matches.push({ label: "Explicit Choice", value: opts.authChoice });
  }

  return {
    matches,
    choice: choice as any,
  };
}
