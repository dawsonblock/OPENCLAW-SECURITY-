#!/usr/bin/env node

import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import net from "node:net";

const bindHost = process.env.OPENCLAW_BROWSER_AUTH_PROXY_BIND_HOST ?? "127.0.0.1";
const bindPort = Number(process.env.OPENCLAW_BROWSER_AUTH_PROXY_BIND_PORT ?? "0");
const upstreamHost = process.env.OPENCLAW_BROWSER_AUTH_PROXY_UPSTREAM_HOST ?? "127.0.0.1";
const upstreamPort = Number(process.env.OPENCLAW_BROWSER_AUTH_PROXY_UPSTREAM_PORT ?? "0");
const token = process.env.OPENCLAW_BROWSER_AUTH_PROXY_TOKEN ?? "";

function isValidPort(port) {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

if (!isValidPort(bindPort) || !isValidPort(upstreamPort) || !token) {
  console.error("browser-auth-proxy: invalid config");
  process.exit(1);
}

function isAuthorized(req) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== "string") {
    return false;
  }
  const expected = Buffer.from(`Bearer ${token}`);
  const provided = Buffer.from(authHeader.trim());
  if (expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(expected, provided);
}

function denyHttp(res) {
  res.statusCode = 401;
  res.setHeader("www-authenticate", 'Bearer realm="openclaw-browser"');
  res.end("Unauthorized");
}

function denySocket(socket) {
  socket.write(
    "HTTP/1.1 401 Unauthorized\r\n" +
      'WWW-Authenticate: Bearer realm="openclaw-browser"\r\n' +
      "Connection: close\r\n" +
      "\r\n",
  );
  socket.destroy();
}

const server = http.createServer((req, res) => {
  if (!isAuthorized(req)) {
    denyHttp(res);
    return;
  }

  const headers = { ...req.headers };
  delete headers.authorization;
  headers.host = `${upstreamHost}:${upstreamPort}`;

  const upstream = http.request(
    {
      hostname: upstreamHost,
      port: upstreamPort,
      method: req.method,
      path: req.url,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.once("error", () => {
    if (!res.headersSent) {
      res.statusCode = 502;
    }
    res.end("Upstream proxy error");
  });

  req.pipe(upstream);
});

server.on("upgrade", (req, socket, head) => {
  if (!isAuthorized(req)) {
    denySocket(socket);
    return;
  }

  const upstream = net.connect(upstreamPort, upstreamHost, () => {
    let handshake = `GET ${req.url ?? "/"} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const key = req.rawHeaders[i];
      const value = req.rawHeaders[i + 1];
      if (!key || value == null) {
        continue;
      }
      if (key.toLowerCase() === "authorization") {
        continue;
      }
      if (key.toLowerCase() === "host") {
        continue;
      }
      handshake += `${key}: ${value}\r\n`;
    }
    handshake += `Host: ${upstreamHost}:${upstreamPort}\r\n\r\n`;
    upstream.write(handshake);
    if (head && head.length > 0) {
      upstream.write(head);
    }
    socket.pipe(upstream).pipe(socket);
  });

  const teardown = () => {
    socket.destroy();
    upstream.destroy();
  };
  upstream.once("error", teardown);
  socket.once("error", teardown);
});

server.listen(bindPort, bindHost, () => {
  process.stdout.write(
    `browser-auth-proxy listening on ${bindHost}:${bindPort} -> ${upstreamHost}:${upstreamPort}\n`,
  );
});
