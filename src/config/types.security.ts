export type SecurityModelSettings = {
  /**
   * List of allowed remote providers (e.g. "openai", "anthropic").
   * If set, only these providers can be used.
   */
  providerAllowlist?: string[];
};

export type SecurityNetworkSettings = {
  /**
   * List of allowed domains for network proxy.
   */
  allowlist?: string[];
};

export type SecurityConfig = {
  model?: SecurityModelSettings;
  network?: SecurityNetworkSettings;
};
