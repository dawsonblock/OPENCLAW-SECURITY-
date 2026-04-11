import type { Api, Model } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { normalizeModelCompat } from "./model-compat.js";

const makeModel = (baseUrl: string, provider = "custom"): Model<Api> =>
  ({
    id: "test-model",
    name: "Test Model",
    api: "openai-completions",
    provider,
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 1024,
  }) as Model<Api>;

describe("normalizeModelCompat", () => {
  it("forces supportsDeveloperRole off for z.ai models (third-party)", () => {
    const model = makeModel("https://api.z.ai/api/coding/paas/v4", "zai");
    delete (model as { compat?: unknown }).compat;
    const normalized = normalizeModelCompat(model);
    expect(normalized.compat?.supportsDeveloperRole).toBe(false);
  });

  it("forces supportsDeveloperRole off for Ollama (third-party)", () => {
    const model = makeModel("http://127.0.0.1:11434/v1", "my-ollama");
    delete (model as { compat?: unknown }).compat;
    const normalized = normalizeModelCompat(model);
    expect(normalized.compat?.supportsDeveloperRole).toBe(false);
  });

  it("forces supportsDeveloperRole off for GitHub Models (third-party Azure)", () => {
    const model = makeModel("https://models.inference.ai.azure.com", "my-github-models");
    delete (model as { compat?: unknown }).compat;
    const normalized = normalizeModelCompat(model);
    expect(normalized.compat?.supportsDeveloperRole).toBe(false);
  });

  it("leaves native OpenAI endpoint untouched", () => {
    const model = makeModel("https://api.openai.com/v1", "openai");
    delete (model as { compat?: unknown }).compat;
    const normalized = normalizeModelCompat(model);
    expect(normalized.compat).toBeUndefined();
  });

  it("does not override explicit compat false already set", () => {
    const model = makeModel("https://api.z.ai/api/coding/paas/v4", "zai");
    model.compat = { supportsDeveloperRole: false };
    const normalized = normalizeModelCompat(model);
    expect(normalized.compat?.supportsDeveloperRole).toBe(false);
  });

  it("leaves non-completions (anthropic) models untouched", () => {
    const model = {
      ...makeModel("https://api.anthropic.com/v1", "anthropic"),
      api: "anthropic-messages" as const,
    } as Model<Api>;
    delete (model as { compat?: unknown }).compat;
    const normalized = normalizeModelCompat(model);
    expect(normalized.compat).toBeUndefined();
  });
});
