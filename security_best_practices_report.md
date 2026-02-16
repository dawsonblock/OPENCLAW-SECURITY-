# Security Best Practices Report

## Executive Summary

I reviewed the current AetherBot tree for missed security issues after the RFSN integration work. There are several high-impact gaps still open: unsafe archive extraction, permissive remote embedding overrides, browser debugging/UI bridge exposure, and non-loopback webhook defaults. The RFSN gate is present for agent-tool dispatch but it is not yet the final authority for all side effects across extensions/runtime code paths.

## Critical Findings

### SEC-001 (Critical): Archive extraction is still path-traversal/symlink unsafe

- Impact: A crafted archive can overwrite files outside the intended extraction directory (zip-slip/tar traversal) or place symlinks for post-extract escape.
- Location:
  `/Users/dawsonblock/Downloads/openclaw-main/src/agents/skills-install.ts:267`
  `/Users/dawsonblock/Downloads/openclaw-main/src/agents/skills-install.ts:274`
  `/Users/dawsonblock/Downloads/openclaw-main/src/agents/skills-install.ts:247`
  `/Users/dawsonblock/Downloads/openclaw-main/src/commands/signal-install.ts:160`
  `/Users/dawsonblock/Downloads/openclaw-main/src/commands/signal-install.ts:164`
- Evidence: Archives are extracted directly with `unzip`/`tar` into target directories, without pre-validating entry paths, rejecting links, or staging+verify flow. Skill download path also has no byte cap on streamed download.
- Fix: Pre-list entries and reject absolute/`..`/drive-letter/link entries, extract into temp dir, enforce file/byte quotas, validate tree, then move into target.

## High Findings

### SEC-002 (High): Remote embeddings allow unvalidated base URL and auth-header override

- Impact: SSRF and credential exfiltration risk if `remote.baseUrl`/`remote.headers` are influenced by config or runtime input.
- Location:
  `/Users/dawsonblock/Downloads/openclaw-main/src/memory/embeddings-openai.ts:83`
  `/Users/dawsonblock/Downloads/openclaw-main/src/memory/embeddings-openai.ts:84`
  `/Users/dawsonblock/Downloads/openclaw-main/src/memory/embeddings-openai.ts:88`
  `/Users/dawsonblock/Downloads/openclaw-main/src/memory/embeddings-gemini.ts:146`
  `/Users/dawsonblock/Downloads/openclaw-main/src/memory/embeddings-gemini.ts:148`
  `/Users/dawsonblock/Downloads/openclaw-main/src/memory/embeddings-gemini.ts:152`
  `/Users/dawsonblock/Downloads/openclaw-main/src/memory/embeddings-voyage.ts:91`
  `/Users/dawsonblock/Downloads/openclaw-main/src/memory/embeddings-voyage.ts:92`
  `/Users/dawsonblock/Downloads/openclaw-main/src/memory/embeddings-voyage.ts:96`
- Evidence: `remote.baseUrl` is accepted directly and header overrides are spread after auth headers, allowing `Authorization` replacement.
- Fix: Enforce HTTPS + SSRF guard on base URL; block overriding `Authorization/Cookie/Host/Proxy-*`; set provider auth headers last.

### SEC-003 (High): Browser debug stack can be exposed without auth; noVNC may bind externally

- Impact: Remote control of browser session (cookies/storage/JS execution) if CDP is exposed; unintended LAN noVNC exposure.
- Location:
  `/Users/dawsonblock/Downloads/openclaw-main/scripts/sandbox-browser-entrypoint.sh:60`
  `/Users/dawsonblock/Downloads/openclaw-main/scripts/sandbox-browser-entrypoint.sh:63`
  `/Users/dawsonblock/Downloads/openclaw-main/scripts/sandbox-browser-entrypoint.sh:67`
  `/Users/dawsonblock/Downloads/openclaw-main/scripts/sandbox-browser-entrypoint.sh:72`
- Evidence: `OPENCLAW_BROWSER_EXPOSE_CDP=1` allows bind host exposure with warning only (no auth gate). `websockify` is launched without explicit host bind.
- Fix: Require auth token/proxy when exposing CDP; keep default loopback; force noVNC bind host to loopback unless explicit LAN opt-in.

### SEC-004 (High): WebView/WKWebView bridge trust boundary is too broad for local-network hosts

- Impact: If navigation reaches attacker-controlled local/LAN hostname, JS bridge actions can be triggered from untrusted content.
- Location:
  `/Users/dawsonblock/Downloads/openclaw-main/apps/android/app/src/main/java/ai/openclaw/android/ui/RootScreen.kt:350`
  `/Users/dawsonblock/Downloads/openclaw-main/apps/android/app/src/main/java/ai/openclaw/android/ui/RootScreen.kt:362`
  `/Users/dawsonblock/Downloads/openclaw-main/apps/android/app/src/main/java/ai/openclaw/android/ui/RootScreen.kt:432`
  `/Users/dawsonblock/Downloads/openclaw-main/apps/ios/Sources/Screen/ScreenController.swift:299`
  `/Users/dawsonblock/Downloads/openclaw-main/apps/ios/Sources/Screen/ScreenController.swift:430`
  `/Users/dawsonblock/Downloads/openclaw-main/apps/macos/Sources/OpenClaw/CanvasA2UIActionMessageHandler.swift:25`
  `/Users/dawsonblock/Downloads/openclaw-main/apps/macos/Sources/OpenClaw/CanvasA2UIActionMessageHandler.swift:111`
  `/Users/dawsonblock/Downloads/openclaw-main/apps/macos/Sources/OpenClaw/CanvasWindowController+Navigation.swift:40`
- Evidence: Trust predicates allow `.local/.lan/.internal` and broad local-network patterns; macOS navigation allows `data:` and `javascript:`.
- Fix: Restrict bridge to fixed trusted origin(s)/custom scheme only; tighten navigation allowlist; disallow `data:`/`javascript:` for canvas content.

### SEC-005 (High): RFSN does not yet mediate actual side-effect primitives across runtime/extensions

- Impact: Tool-level gate exists, but raw spawn/network side effects still execute directly in many extension/runtime paths, so kernel is not final authority globally.
- Location:
  `/Users/dawsonblock/Downloads/openclaw-main/src/rfsn/dispatch.ts:127`
  `/Users/dawsonblock/Downloads/openclaw-main/extensions/voice-call/src/tunnel.ts:62`
  `/Users/dawsonblock/Downloads/openclaw-main/extensions/lobster/src/lobster-tool.ts:120`
  `/Users/dawsonblock/Downloads/openclaw-main/extensions/zalouser/src/zca.ts:24`
- Evidence: `rfsnDispatch` validates proposal then calls `tool.execute(...)`; side effects inside tools/extensions are not forced through `secureFetch`/`secureSpawn` kernel primitives.
- Fix: Move dangerous operations behind kernel primitives and enforce usage by code policy/CI.

## Medium Findings

### SEC-006 (Medium): Non-loopback listener defaults remain in webhook/local services

- Impact: Services are reachable on all interfaces by default in paths that should be local-first.
- Location:
  `/Users/dawsonblock/Downloads/openclaw-main/src/telegram/webhook.ts:36`
  `/Users/dawsonblock/Downloads/openclaw-main/extensions/nextcloud-talk/src/monitor.ts:15`
  `/Users/dawsonblock/Downloads/openclaw-main/skills/local-places/src/local_places/main.py:65`
- Evidence: Default host remains `0.0.0.0` in these services.
- Fix: Default to loopback and require explicit LAN opt-in + auth hard requirement.

### SEC-007 (Medium): Nextcloud Talk webhook request body has no size cap

- Impact: Memory DoS risk via oversized request body.
- Location:
  `/Users/dawsonblock/Downloads/openclaw-main/extensions/nextcloud-talk/src/monitor.ts:65`
  `/Users/dawsonblock/Downloads/openclaw-main/extensions/nextcloud-talk/src/monitor.ts:95`
- Evidence: Request body is fully buffered with no byte ceiling.
- Fix: Add strict body-size cap and early termination on overflow.

### SEC-008 (Medium): BlueBubbles webhook authentication is optional when password is unset

- Impact: If endpoint is exposed and account password is missing, webhook accepts unauthenticated requests.
- Location:
  `/Users/dawsonblock/Downloads/openclaw-main/extensions/bluebubbles/src/monitor.ts:1542`
  `/Users/dawsonblock/Downloads/openclaw-main/extensions/bluebubbles/src/monitor.ts:1544`
- Evidence: Token check is bypassed when no configured password.
- Fix: Require auth token whenever endpoint is externally reachable (or enforce loopback-only when auth missing).

### SEC-009 (Medium): Secrets are embedded in query strings and emitted in setup logs

- Impact: Token leakage through logs/history/proxies.
- Location:
  `/Users/dawsonblock/Downloads/openclaw-main/src/hooks/gmail-setup-utils.ts:315`
  `/Users/dawsonblock/Downloads/openclaw-main/src/hooks/gmail-ops.ts:257`
  `/Users/dawsonblock/Downloads/openclaw-main/src/hooks/gmail-ops.ts:259`
  `/Users/dawsonblock/Downloads/openclaw-main/src/hooks/gmail-ops.ts:269`
  `/Users/dawsonblock/Downloads/openclaw-main/src/hooks/gmail-ops.ts:277`
- Evidence: `pushEndpoint` appends `?token=...`; setup summary/log output includes `hookToken`, `pushToken`, and full endpoint.
- Fix: Move tokens to headers where possible; redact or suppress tokens in logs/JSON output.

### SEC-010 (Medium): Final-authority regression test scope is limited to `src/`

- Impact: Security bypasses in `extensions/`, `skills/`, and shell scripts can regress unnoticed.
- Location:
  `/Users/dawsonblock/Downloads/openclaw-main/src/rfsn/final-authority.test.ts:5`
- Evidence: Scan root is `src` only; bypass primitives in other runtime surfaces are not covered by this test.
- Fix: Extend checks to extension/skill/runtime script surfaces or add dedicated enforcement tests.

## Open Questions / Assumptions

- I assumed threat model includes untrusted local-network pages (common on shared LAN/Wi-Fi).
- I assumed `agents.defaults.memorySearch.remote.*` can be modified by operators and possibly automation paths; if strictly immutable admin-only, SEC-002 severity can be reduced.
- I assumed webhook services may run with gateway LAN bind in some deployments.

## Recommended Immediate Order

1. SEC-001 (archive extraction safety) and SEC-002 (embeddings SSRF/auth override).
2. SEC-003 and SEC-004 (browser debugging + WebView bridge trust boundaries).
3. SEC-005 and SEC-010 (make kernel truly final authority with enforceable coverage).
4. SEC-006/007/008/009 (listener defaults, body caps, auth hardening, token redaction).
