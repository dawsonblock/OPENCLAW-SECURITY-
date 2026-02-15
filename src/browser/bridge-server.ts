import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { timingSafeEqual } from "node:crypto";
import type { ResolvedBrowserConfig } from "./config.js";
import type { BrowserRouteRegistrar } from "./routes/types.js";
import { registerBrowserRoutes } from "./routes/index.js";
import {
  type BrowserServerState,
  createBrowserRouteContext,
  type ProfileContext,
} from "./server-context.js";

export type BrowserBridge = {
  server: Server;
  port: number;
  baseUrl: string;
  state: BrowserServerState;
};

function isLoopbackHost(hostRaw: string): boolean {
  const host = hostRaw
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function safeEqualToken(expected: string, provided: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export async function startBrowserBridgeServer(params: {
  resolved: ResolvedBrowserConfig;
  host?: string;
  port?: number;
  authToken?: string;
  onEnsureAttachTarget?: (profile: ProfileContext["profile"]) => Promise<void>;
}): Promise<BrowserBridge> {
  const host = params.host ?? "127.0.0.1";
  const port = params.port ?? 0;

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const authToken = params.authToken?.trim();
  const allowLan = process.env.OPENCLAW_BROWSER_BRIDGE_ALLOW_LAN?.trim() === "1";
  if (!isLoopbackHost(host) && !allowLan) {
    throw new Error(
      `browser bridge host "${host}" is not loopback. Set OPENCLAW_BROWSER_BRIDGE_ALLOW_LAN=1 to allow.`,
    );
  }
  if (!isLoopbackHost(host) && !authToken) {
    throw new Error(
      `browser bridge host "${host}" requires authToken when binding non-loopback interfaces.`,
    );
  }
  if (authToken) {
    app.use((req, res, next) => {
      const auth = String(req.headers.authorization ?? "").trim();
      if (safeEqualToken(`Bearer ${authToken}`, auth)) {
        return next();
      }
      res.status(401).send("Unauthorized");
    });
  }

  // Hardening: Enforce Content-Type and Origin
  app.use((req, res, next) => {
    // 1. Strict Content-Type for POST/PUT/PATCH
    if (
      ["POST", "PUT", "PATCH"].includes(req.method) &&
      req.headers["content-type"] !== "application/json"
    ) {
      res.status(415).send("Unsupported Media Type: Content-Type must be application/json");
      return;
    }

    // 2. Origin Validation
    const origin = req.headers["origin"];
    if (origin) {
      // Allow file:// (local electron/files), vscode-webview:// (VS Code), or localhost (loopback)
      // Adjust regex as needed for strictness.
      const isAllowed =
        origin.startsWith("file://") ||
        origin.startsWith("vscode-webview://") ||
        // Allow loopback origins for local dev
        /^http:\/\/localhost:\d+$/.test(origin) ||
        /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);

      if (!isAllowed) {
        // Check if explicitly allowed via env (e.g. for specific dev setups)
        const allowedOrigins = (process.env.OPENCLAW_BROWSER_BRIDGE_ALLOWED_ORIGINS || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (!allowedOrigins.includes(origin)) {
          res.status(403).send("Forbidden: Origin not allowed");
          return;
        }
      }
    }
    next();
  });

  const state: BrowserServerState = {
    server: null as unknown as Server,
    port,
    resolved: params.resolved,
    profiles: new Map(),
  };

  const ctx = createBrowserRouteContext({
    getState: () => state,
    onEnsureAttachTarget: params.onEnsureAttachTarget,
  });
  registerBrowserRoutes(app as unknown as BrowserRouteRegistrar, ctx);

  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.once("error", reject);
  });

  const address = server.address() as AddressInfo | null;
  const resolvedPort = address?.port ?? port;
  state.server = server;
  state.port = resolvedPort;
  state.resolved.controlPort = resolvedPort;

  const baseUrl = `http://${host}:${resolvedPort}`;
  return { server, port: resolvedPort, baseUrl, state };
}

export async function stopBrowserBridgeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}
