import { html, nothing } from "lit";

// ─── Types ───────────────────────────────────────────────────────────────────

type ModelApi =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai"
  | "github-copilot"
  | "bedrock-converse-stream";

type ProviderPreset = {
  label: string;
  api: ModelApi;
  baseUrl: string;
  placeholder: string;
  authHint: string;
};

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    label: "OpenAI",
    api: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    placeholder: "sk-...",
    authHint: "OpenAI API key from platform.openai.com",
  },
  {
    label: "Anthropic",
    api: "anthropic-messages",
    baseUrl: "https://api.anthropic.com/v1",
    placeholder: "sk-ant-...",
    authHint: "Anthropic API key from console.anthropic.com",
  },
  {
    label: "Google Gemini",
    api: "google-generative-ai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    placeholder: "AIza...",
    authHint: "Google AI Studio API key from aistudio.google.com",
  },
  {
    label: "OpenAI-Compatible",
    api: "openai-completions",
    baseUrl: "",
    placeholder: "sk-...",
    authHint: "Any OpenAI-compatible API (Groq, Together, local, etc.)",
  },
  {
    label: "GitHub Copilot",
    api: "github-copilot",
    baseUrl: "https://api.githubcopilot.com",
    placeholder: "ghu_...",
    authHint: "GitHub personal access token",
  },
  {
    label: "AWS Bedrock",
    api: "bedrock-converse-stream",
    baseUrl: "",
    placeholder: "",
    authHint: "Uses AWS SDK credentials (no API key needed)",
  },
];

export type ModelsProps = {
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  connected: boolean;
  onConfigPatch: (path: Array<string | number>, value: unknown) => void;
  onConfigRemove: (path: Array<string | number>) => void;
  onConfigSave: () => void;
  onConfigReload: () => void;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveProviders(
  config: Record<string, unknown> | null,
): Record<string, Record<string, unknown>> {
  if (!config) {
    return {};
  }
  const models = config.models as Record<string, unknown> | undefined;
  if (!models || typeof models !== "object") {
    return {};
  }
  const providers = models.providers as Record<string, Record<string, unknown>> | undefined;
  if (!providers || typeof providers !== "object") {
    return {};
  }
  return providers;
}

function countModels(provider: Record<string, unknown>): number {
  const models = provider.models;
  return Array.isArray(models) ? models.length : 0;
}

function maskKey(key: string | undefined): string {
  if (!key) {
    return "Not set";
  }
  if (key.length <= 8) {
    return "••••••••";
  }
  return `${key.slice(0, 4)}${"•".repeat(Math.min(key.length - 8, 16))}${key.slice(-4)}`;
}

function apiLabel(api: string | undefined): string {
  switch (api) {
    case "openai-completions":
      return "OpenAI Completions";
    case "openai-responses":
      return "OpenAI Responses";
    case "anthropic-messages":
      return "Anthropic Messages";
    case "google-generative-ai":
      return "Google Generative AI";
    case "github-copilot":
      return "GitHub Copilot";
    case "bedrock-converse-stream":
      return "AWS Bedrock";
    default:
      return api ?? "Unknown";
  }
}

// ─── Render ──────────────────────────────────────────────────────────────────

function renderProviderCard(
  key: string,
  provider: Record<string, unknown>,
  props: ModelsProps,
  editingKey: string | null,
  onEdit: (key: string | null) => void,
) {
  const isEditing = editingKey === key;
  const apiKey = provider.apiKey as string | undefined;
  const baseUrl = provider.baseUrl as string | undefined;
  const api = provider.api as string | undefined;
  const modelCount = countModels(provider);

  if (isEditing) {
    return html`
      <div class="card" style="margin-bottom: 16px; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="font-weight: 600; font-size: 16px;">${key}</div>
          <button class="btn" @click=${() => onEdit(null)}>Cancel</button>
        </div>

        <div class="status-list" style="gap: 12px; display: flex; flex-direction: column;">
          <div>
            <label class="label" style="display: block; margin-bottom: 4px;">Base URL</label>
            <input
              class="input"
              type="text"
              .value=${baseUrl ?? ""}
              @input=${(e: InputEvent) => {
                const target = e.target as HTMLInputElement;
                props.onConfigPatch(["models", "providers", key, "baseUrl"], target.value);
              }}
              style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-family: var(--mono); font-size: 13px;"
            />
          </div>

          <div>
            <label class="label" style="display: block; margin-bottom: 4px;">API Key</label>
            <input
              class="input"
              type="password"
              .value=${apiKey ?? ""}
              placeholder="Enter API key…"
              @input=${(e: InputEvent) => {
                const target = e.target as HTMLInputElement;
                props.onConfigPatch(["models", "providers", key, "apiKey"], target.value);
              }}
              style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-family: var(--mono); font-size: 13px;"
            />
          </div>

          <div>
            <label class="label" style="display: block; margin-bottom: 4px;">API Type</label>
            <select
              style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; background: var(--bg);"
              @change=${(e: Event) => {
                const target = e.target as HTMLSelectElement;
                props.onConfigPatch(["models", "providers", key, "api"], target.value);
              }}
            >
              ${PROVIDER_PRESETS.map(
                (preset) => html`
                  <option value=${preset.api} ?selected=${api === preset.api}>
                    ${preset.label} (${preset.api})
                  </option>
                `,
              )}
            </select>
          </div>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button
            class="btn primary"
            ?disabled=${props.configSaving}
            @click=${() => {
              props.onConfigSave();
              onEdit(null);
            }}
          >
            ${props.configSaving ? "Saving…" : "Save"}
          </button>
          <button
            class="btn danger"
            @click=${() => {
              props.onConfigRemove(["models", "providers", key]);
              props.onConfigSave();
              onEdit(null);
            }}
          >
            Remove Provider
          </button>
        </div>
      </div>
    `;
  }

  return html`
    <div class="card" style="margin-bottom: 12px; padding: 16px; cursor: pointer;" @click=${() => onEdit(key)}>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">${key}</div>
          <div class="muted" style="font-size: 13px;">${apiLabel(api)}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 13px; font-family: var(--mono);">
            ${
              baseUrl
                ? html`<span class="muted">${new URL(baseUrl).hostname}</span>`
                : html`
                    <span class="muted">No URL</span>
                  `
            }
          </div>
          <div style="font-size: 12px; margin-top: 2px;">
            <span class="muted">Key: ${maskKey(apiKey)}</span>
            ${modelCount > 0 ? html` · <span class="muted">${modelCount} model${modelCount !== 1 ? "s" : ""}</span>` : nothing}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAddProvider(
  props: ModelsProps,
  addingPreset: ProviderPreset | null,
  newProviderName: string,
  newApiKey: string,
  newBaseUrl: string,
  onPresetSelect: (preset: ProviderPreset | null) => void,
  onNameChange: (name: string) => void,
  onApiKeyChange: (key: string) => void,
  onBaseUrlChange: (url: string) => void,
) {
  return html`
    <div class="card" style="padding: 20px; margin-top: 24px;">
      <div style="font-weight: 600; font-size: 16px; margin-bottom: 16px;">Add Provider</div>

      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-bottom: 16px;">
        ${PROVIDER_PRESETS.map(
          (preset) => html`
            <button
              class="btn ${addingPreset?.api === preset.api ? "primary" : ""}"
              style="text-align: center; padding: 10px 8px;"
              @click=${() => {
                onPresetSelect(preset);
                if (!newProviderName) {
                  onNameChange(preset.label.toLowerCase().replace(/[^a-z0-9]/g, "-"));
                }
                onBaseUrlChange(preset.baseUrl);
              }}
            >
              ${preset.label}
            </button>
          `,
        )}
      </div>

      ${
        addingPreset
          ? html`
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <div>
                <label class="label" style="display: block; margin-bottom: 4px;">Provider Name (unique ID)</label>
                <input
                  class="input"
                  type="text"
                  .value=${newProviderName}
                  placeholder="e.g. openai, my-local-llm"
                  @input=${(e: InputEvent) => onNameChange((e.target as HTMLInputElement).value)}
                  style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-family: var(--mono); font-size: 13px;"
                />
              </div>

              <div>
                <label class="label" style="display: block; margin-bottom: 4px;">Base URL</label>
                <input
                  class="input"
                  type="text"
                  .value=${newBaseUrl}
                  placeholder="https://api.example.com/v1"
                  @input=${(e: InputEvent) => onBaseUrlChange((e.target as HTMLInputElement).value)}
                  style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-family: var(--mono); font-size: 13px;"
                />
              </div>

              <div>
                <label class="label" style="display: block; margin-bottom: 4px;">
                  API Key
                  <span class="muted" style="font-weight: normal; margin-left: 8px;">${addingPreset.authHint}</span>
                </label>
                <input
                  class="input"
                  type="password"
                  .value=${newApiKey}
                  placeholder=${addingPreset.placeholder}
                  @input=${(e: InputEvent) => onApiKeyChange((e.target as HTMLInputElement).value)}
                  style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-family: var(--mono); font-size: 13px;"
                />
              </div>

              <div style="display: flex; gap: 8px; margin-top: 4px;">
                <button
                  class="btn primary"
                  ?disabled=${!newProviderName.trim() || props.configSaving}
                  @click=${() => {
                    const name = newProviderName.trim();
                    if (!name) {
                      return;
                    }
                    const provider: Record<string, unknown> = {
                      baseUrl: newBaseUrl,
                      api: addingPreset.api,
                      models: [],
                    };
                    if (newApiKey) {
                      provider.apiKey = newApiKey;
                    }
                    props.onConfigPatch(["models", "providers", name], provider);
                    props.onConfigSave();
                    onPresetSelect(null);
                    onNameChange("");
                    onApiKeyChange("");
                    onBaseUrlChange("");
                  }}
                >
                  Add Provider
                </button>
                <button class="btn" @click=${() => onPresetSelect(null)}>Cancel</button>
              </div>
            </div>
          `
          : nothing
      }
    </div>
  `;
}

// ─── Gateway Network ─────────────────────────────────────────────────────────

type BindMode = "auto" | "lan" | "loopback" | "custom" | "tailnet";

const BIND_MODES: { value: BindMode; label: string; desc: string; color: string }[] = [
  {
    value: "loopback",
    label: "Loopback",
    desc: "127.0.0.1 — local only (most secure)",
    color: "#22c55e",
  },
  {
    value: "lan",
    label: "LAN",
    desc: "0.0.0.0 — all interfaces (phone/tablet access)",
    color: "#eab308",
  },
  { value: "auto", label: "Auto", desc: "Automatic binding", color: "#3b82f6" },
  { value: "tailnet", label: "Tailscale", desc: "Tailscale network only", color: "#8b5cf6" },
  { value: "custom", label: "Custom", desc: "User-specified address", color: "#6b7280" },
];

function resolveBindMode(config: Record<string, unknown> | null): BindMode {
  if (!config) {
    return "auto";
  }
  const gateway = config.gateway as Record<string, unknown> | undefined;
  if (!gateway || typeof gateway !== "object") {
    return "auto";
  }
  const bind = gateway.bind as string | undefined;
  if (bind && BIND_MODES.some((m) => m.value === bind)) {
    return bind as BindMode;
  }
  return "auto";
}

function renderGatewayNetwork(props: ModelsProps) {
  const current = resolveBindMode(props.configForm);
  const mode = BIND_MODES.find((m) => m.value === current) ?? BIND_MODES[0];
  const isExposed = current === "lan" || current === "custom";

  return html`
    <div class="card" style="margin-bottom: 24px; padding: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="font-weight: 600; font-size: 16px;">🛡️ Gateway Network</div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span
            style="width: 8px; height: 8px; border-radius: 50%; background: ${mode.color}; display: inline-block;"
          ></span>
          <span style="font-size: 13px; font-weight: 500;">${mode.label}</span>
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <label class="label" style="display: block; margin-bottom: 4px;">Bind Mode</label>
        <select
          style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; background: var(--bg);"
          @change=${(e: Event) => {
            const target = e.target as HTMLSelectElement;
            props.onConfigPatch(["gateway", "bind"], target.value);
            props.onConfigSave();
          }}
        >
          ${BIND_MODES.map(
            (m) => html`
              <option value=${m.value} ?selected=${current === m.value}>
                ${m.label} — ${m.desc}
              </option>
            `,
          )}
        </select>
      </div>

      ${
        isExposed
          ? html`
              <div
                style="
                  padding: 10px 14px;
                  border-radius: 6px;
                  font-size: 13px;
                  line-height: 1.5;
                  background: rgba(234, 179, 8, 0.1);
                  border: 1px solid rgba(234, 179, 8, 0.3);
                  color: var(--text);
                "
              >
                ⚠️ <strong>Security:</strong> Any device on your network can reach the gateway. Use a strong token
                and switch back to <strong>Loopback</strong> when done.
              </div>
            `
          : html`
              <div
                style="
                  padding: 10px 14px;
                  border-radius: 6px;
                  font-size: 13px;
                  line-height: 1.5;
                  background: rgba(34, 197, 94, 0.1);
                  border: 1px solid rgba(34, 197, 94, 0.3);
                  color: var(--text);
                "
              >
                ✅ Gateway is only reachable from this machine.
              </div>
            `
      }

      <div class="muted" style="font-size: 12px; margin-top: 8px;">
        Changes take effect after gateway restart.
      </div>
    </div>
  `;
}

// ─── Module-scope form state ─────────────────────────────────────────────────
// Lit re-renders blow away local variables, so we keep form state at module scope.

let _editingKey: string | null = null;
let _addingPreset: ProviderPreset | null = null;
let _newProviderName = "";
let _newApiKey = "";
let _newBaseUrl = "";

export function renderModels(props: ModelsProps) {
  const providers = resolveProviders(props.configForm);
  const entries = Object.entries(providers);

  return html`
    <div style="max-width: 720px;">
      ${renderGatewayNetwork(props)}

      ${
        entries.length === 0 && !_addingPreset
          ? html`
              <div class="callout" style="margin-bottom: 16px">
                No LLM providers configured yet. Click a provider below to get started.
              </div>
            `
          : nothing
      }

      ${entries.map(([key, provider]) =>
        renderProviderCard(key, provider, props, _editingKey, (next) => {
          _editingKey = next;
        }),
      )}

      ${renderAddProvider(
        props,
        _addingPreset,
        _newProviderName,
        _newApiKey,
        _newBaseUrl,
        (preset) => {
          _addingPreset = preset;
        },
        (name) => {
          _newProviderName = name;
        },
        (key) => {
          _newApiKey = key;
        },
        (url) => {
          _newBaseUrl = url;
        },
      )}

      <div style="margin-top: 20px; display: flex; gap: 8px;">
        <button
          class="btn"
          ?disabled=${props.configLoading}
          @click=${() => props.onConfigReload()}
        >
          Reload
        </button>
      </div>
    </div>
  `;
}
