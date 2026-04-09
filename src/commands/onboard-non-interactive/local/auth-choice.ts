import type { OpenClawConfig } from "../../../config/config.js";
import type { RuntimeEnv } from "../../../runtime.js";
import type { WizardPrompter } from "../../../wizard/prompts.js";
import type { OnboardOptions } from "../../onboard-types.js";
import { applyAuthChoice } from "../../auth-choice.apply.js";

function getProviderContext(opts: OnboardOptions, authChoice: string) {
  let tokenProvider: string | undefined = opts.tokenProvider;
  let token: string | undefined = opts.token;

  if (authChoice === "openai-api-key" && opts.openaiApiKey) {
    token = opts.openaiApiKey;
    tokenProvider = "openai";
  } else if (
    (authChoice === "anthropic-api-key" || authChoice === "claude-cli") &&
    opts.anthropicApiKey
  ) {
    token = opts.anthropicApiKey;
    tokenProvider = "anthropic";
  } else if (authChoice === "ai-gateway-api-key" && opts.aiGatewayApiKey) {
    token = opts.aiGatewayApiKey;
    tokenProvider = "vercel-ai-gateway";
  } else if (authChoice === "cloudflare-ai-gateway-api-key" && opts.cloudflareAiGatewayApiKey) {
    token = opts.cloudflareAiGatewayApiKey;
    tokenProvider = "cloudflare-ai-gateway";
  } else if (authChoice === "moonshot-api-key" && opts.moonshotApiKey) {
    token = opts.moonshotApiKey;
    tokenProvider = "moonshot";
  } else if (authChoice === "kimi-code-api-key" && opts.kimiCodeApiKey) {
    token = opts.kimiCodeApiKey;
    tokenProvider = "kimi-coding";
  } else if (authChoice === "gemini-api-key" && opts.geminiApiKey) {
    token = opts.geminiApiKey;
    tokenProvider = "google";
  } else if (authChoice === "zai-api-key" && opts.zaiApiKey) {
    token = opts.zaiApiKey;
    tokenProvider = "zai";
  } else if (authChoice === "xiaomi-api-key" && opts.xiaomiApiKey) {
    token = opts.xiaomiApiKey;
    tokenProvider = "xiaomi";
  } else if (authChoice === "synthetic-api-key" && opts.syntheticApiKey) {
    token = opts.syntheticApiKey;
    tokenProvider = "synthetic";
  } else if (authChoice === "venice-api-key" && opts.veniceApiKey) {
    token = opts.veniceApiKey;
    tokenProvider = "venice";
  } else if (authChoice === "together-api-key" && opts.togetherApiKey) {
    token = opts.togetherApiKey;
    tokenProvider = "together";
  } else if (authChoice === "opencode-zen" && opts.opencodeZenApiKey) {
    token = opts.opencodeZenApiKey;
    tokenProvider = "opencode";
  } else if (authChoice === "xai-api-key" && opts.xaiApiKey) {
    token = opts.xaiApiKey;
    tokenProvider = "xai";
  } else if (authChoice === "qianfan-api-key" && opts.qianfanApiKey) {
    token = opts.qianfanApiKey;
    tokenProvider = "qianfan";
  }

  return { token, tokenProvider };
}

export async function applyNonInteractiveAuthChoice(params: {
  nextConfig: OpenClawConfig;
  authChoice: string;
  opts: OnboardOptions;
  runtime: RuntimeEnv;
}): Promise<OpenClawConfig | undefined> {
  const { authChoice, opts, runtime } = params;

  const prompter: WizardPrompter = {
    intro: async () => {},
    outro: async () => {},
    note: async () => {},
    select: async () => {
      throw new Error("Interactive prompt used in non-interactive mode");
    },
    multiselect: async () => {
      throw new Error("Interactive prompt used in non-interactive mode");
    },
    text: async () => {
      throw new Error("Interactive prompt used in non-interactive mode");
    },
    confirm: async () => {
      throw new Error("Interactive prompt used in non-interactive mode");
    },
    progress: () => ({ update: () => {}, stop: () => {} }),
  };

  const { token, tokenProvider } = getProviderContext(opts, authChoice);

  try {
    const result = await applyAuthChoice({
      authChoice: authChoice as never,
      config: params.nextConfig,
      prompter,
      runtime,
      setDefaultModel: true,
      opts: {
        token,
        tokenProvider,
        tokenProfileId: opts.tokenProfileId,
        xaiApiKey: opts.xaiApiKey,
        cloudflareAiGatewayAccountId: opts.cloudflareAiGatewayAccountId,
        cloudflareAiGatewayGatewayId: opts.cloudflareAiGatewayGatewayId,
        cloudflareAiGatewayApiKey: opts.cloudflareAiGatewayApiKey,
      },
    });

    return result.config;
  } catch (err) {
    runtime.error(`Failed to apply auth choice non-interactively: ${(err as Error).message}`);
    runtime.exit(1);
    return;
  }
}
