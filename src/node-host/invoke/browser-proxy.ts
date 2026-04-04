import { resolveBrowserConfig } from "../../browser/config.js";
import { loadConfig } from "../../config/config.js";
import type { GatewayClient } from "../../gateway/client.js";
import {
  collectBrowserProxyPaths,
  createBrowserProxyDispatcher,
  ensureBrowserControlService,
  isProfileAllowed,
  readBrowserProxyFile,
  resolveBrowserProxyConfig,
  withTimeout,
} from "../browser-proxy.js";
import { decodeParams, sendInvokeResult } from "../events.js";
import type {
  BrowserProxyFile,
  BrowserProxyParams,
  BrowserProxyResult,
  NodeInvokeRequestPayload,
} from "../types.js";

export async function handleBrowserProxy(client: GatewayClient, frame: NodeInvokeRequestPayload) {
  try {
    const params = decodeParams<BrowserProxyParams>(frame.paramsJSON);
    const pathValue = typeof params.path === "string" ? params.path.trim() : "";
    if (!pathValue) {
      throw new Error("INVALID_REQUEST: path required");
    }
    const proxyConfig = resolveBrowserProxyConfig();
    if (!proxyConfig.enabled) {
      throw new Error("UNAVAILABLE: node browser proxy disabled");
    }
    await ensureBrowserControlService();
    const cfg = loadConfig();
    const resolved = resolveBrowserConfig(cfg.browser, cfg);
    const requestedProfile = typeof params.profile === "string" ? params.profile.trim() : "";
    const allowedProfiles = proxyConfig.allowProfiles;
    if (allowedProfiles.length > 0) {
      if (pathValue !== "/profiles") {
        const profileToCheck = requestedProfile || resolved.defaultProfile;
        if (!isProfileAllowed({ allowProfiles: allowedProfiles, profile: profileToCheck })) {
          throw new Error("INVALID_REQUEST: browser profile not allowed");
        }
      } else if (requestedProfile) {
        if (!isProfileAllowed({ allowProfiles: allowedProfiles, profile: requestedProfile })) {
          throw new Error("INVALID_REQUEST: browser profile not allowed");
        }
      }
    }

    const method = typeof params.method === "string" ? params.method.toUpperCase() : "GET";
    const requestPath = pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
    const body = params.body;
    const query: Record<string, unknown> = {};
    if (requestedProfile) {
      query.profile = requestedProfile;
    }
    const rawQuery = params.query ?? {};
    for (const [key, value] of Object.entries(rawQuery)) {
      if (value === undefined || value === null) {
        continue;
      }
      query[key] = typeof value === "string" ? value : String(value);
    }
    const dispatcher = createBrowserProxyDispatcher();
    const response = await withTimeout(
      dispatcher.dispatch({
        method: method === "DELETE" ? "DELETE" : method === "POST" ? "POST" : "GET",
        path: requestPath,
        query,
        body,
      }),
      params.timeoutMs,
      "browser proxy request",
    );
    if (response.status >= 400) {
      const message =
        response.body && typeof response.body === "object" && "error" in response.body
          ? String((response.body as { error?: unknown }).error)
          : `HTTP ${response.status}`;
      throw new Error(message);
    }
    const result = response.body;
    if (allowedProfiles.length > 0 && requestPath === "/profiles") {
      const obj =
        typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
      const profiles = Array.isArray(obj.profiles) ? obj.profiles : [];
      obj.profiles = profiles.filter((entry) => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        const name = (entry as Record<string, unknown>).name;
        return typeof name === "string" && allowedProfiles.includes(name);
      });
    }
    let files: BrowserProxyFile[] | undefined;
    const paths = collectBrowserProxyPaths(result);
    if (paths.length > 0) {
      const loaded = await Promise.all(
        paths.map(async (filePath) => {
          try {
            const file = await readBrowserProxyFile(filePath);
            if (!file) {
              throw new Error("file not found");
            }
            return file;
          } catch (err) {
            throw new Error(`browser proxy file read failed for ${filePath}: ${String(err)}`, {
              cause: err,
            });
          }
        }),
      );
      if (loaded.length > 0) {
        files = loaded;
      }
    }
    const payload: BrowserProxyResult = files ? { result, files } : { result };
    await sendInvokeResult(client, frame, {
      ok: true,
      payloadJSON: JSON.stringify(payload),
    });
  } catch (err) {
    await sendInvokeResult(client, frame, {
      ok: false,
      error: { code: "INVALID_REQUEST", message: String(err) },
    });
  }
}
