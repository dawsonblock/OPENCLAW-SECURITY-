export type FetchJsonConfig = {
  security?: {
    model?: {
      providerAllowlist?: string[];
    };
  };
};

export async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchFn: typeof fetch,
  config?: FetchJsonConfig,
): Promise<Response> {
  // Security: Check Provider Allowlist
  const allowlist = config?.security?.model?.providerAllowlist;
  if (allowlist && allowlist.length > 0) {
    const isAllowed = allowlist.some((pattern) => {
      // Direct match
      if (typeof pattern === "string" && url.includes(pattern)) {
        return true;
      }
      // Regex match (if pattern string looks like regex, though purely string-based simplistic check here for now or strict regex)
      // Implementation Plan mentions regex. Let's support regex if string starts with '^'.
      if (pattern.startsWith("^")) {
        try {
          return new RegExp(pattern).test(url);
        } catch {
          return false;
        }
      }
      return false;
    });

    if (!isAllowed) {
      throw new Error(`Request to ${url} blocked by security policy (provider not in allowlist)`);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
