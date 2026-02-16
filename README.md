# 🦞 OpenClaw — Personal AI Assistant

<p align="center">
    <picture>
        <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text-dark.png">
        <img src="https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png" alt="OpenClaw" width="500">
    </picture>
</p>

<p align="center">
  <strong>Your Secure, Local-First AI Companion.</strong>
</p>

<p align="center">
  <a href="https://github.com/openclaw/openclaw/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/openclaw/openclaw/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://github.com/openclaw/openclaw/releases"><img src="https://img.shields.io/github/v/release/openclaw/openclaw?include_prereleases&style=for-the-badge" alt="GitHub release"></a>
  <a href="https://discord.gg/clawd"><img src="https://img.shields.io/discord/1456350064065904867?label=Discord&logo=discord&logoColor=white&color=5865F2&style=for-the-badge" alt="Discord"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

---

**OpenClaw** is a personal AI assistant that runs entirely on your own devices. It connects to the channels you already use — WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, Microsoft Teams, WebChat — and provides a unified, secure intelligence layer over your digital life. It can speak and listen on macOS/iOS/Android, render a live Canvas you control, and execute tools in a hardened sandbox.

If you want a personal, single-user assistant that feels local, fast, always-on, and **cryptographically secure**, this is it.

[Website](https://openclaw.ai) · [Docs](https://docs.openclaw.ai) · [DeepWiki](https://deepwiki.com/openclaw/openclaw) · [Getting Started](https://docs.openclaw.ai/start/getting-started) · [Showcase](https://docs.openclaw.ai/start/showcase) · [FAQ](https://docs.openclaw.ai/start/faq) · [Discord](https://discord.gg/clawd)

---

## 🚀 Features

| Capability              | Description                                                                                                                       |
| :---------------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| **Local-First Gateway** | Single WebSocket control plane for sessions, channels, tools, and events. Your data stays on your machine.                        |
| **15+ Channels**        | WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, BlueBubbles, Microsoft Teams, Matrix, Zalo, WebChat, and more. |
| **Voice & Vision**      | Always-on **Voice Wake** + **Talk Mode** for macOS/iOS/Android via ElevenLabs. **Canvas** for agent-driven visual workspaces.     |
| **Powerful Tools**      | Browser control (CDP), file system access, cron jobs, webhooks, Gmail Pub/Sub, and a full skills/plugin system.                   |
| **Multi-Agent Routing** | Route different channels/accounts to isolated agents with separate workspaces, sessions, and tool access.                         |
| **Companion Apps**      | macOS menu bar app, iOS node, Android node — all paired over the Gateway protocol.                                                |
| **LLM Flexibility**     | First-class support for OpenAI, Anthropic, Google Gemini, DeepSeek, Groq, Together, Ollama, and AWS Bedrock.                      |

---

## 🏗️ Architecture

```
WhatsApp / Telegram / Slack / Discord / Signal / iMessage / Teams / WebChat
               │
               ▼
┌──────────────────────────────────────────────┐
│               Gateway (Control Plane)        │
│            ws://127.0.0.1:18789              │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Sessions │  │ Channels │  │   Tools   │  │
│  └──────────┘  └──────────┘  └───────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  RFSN    │  │ Security │  │ Forensics │  │
│  │  Policy  │  │  Layer   │  │  & Audit  │  │
│  └──────────┘  └──────────┘  └───────────┘  │
└──────────────────────┬───────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
    Pi Agent        CLI          Companion
     (RPC)      (openclaw …)       Apps
```

The Gateway is the brains. Channels, tools, and clients all connect to it over WebSocket. The **RFSN Policy Engine** sits between the agent and all side-effect primitives, enforcing capability-based access control.

---

## ⚡ Quick Start

Requires **Node.js ≥ 22**. Works with npm, pnpm, or bun.

```bash
# Install globally
npm install -g openclaw@latest

# Run the interactive setup wizard
openclaw onboard --install-daemon

# Start the gateway
openclaw gateway --port 18789 --verbose

# Talk to your agent
openclaw agent --message "Ship checklist" --thinking high
```

Upgrading? Run `openclaw doctor` after updating.

---

## 🤖 Multi-Agent Setup

This fork includes a pre-configured **3-agent setup** with specialized roles:

### Agent Profiles

| Agent        | ID         | Model              | Specialization        | Tools                    |
| ------------ | ---------- | ------------------ | --------------------- | ------------------------ |
| 🔍 **Atlas** | `research` | Gemini 3 Flash     | Research & web search | Web search, web fetch    |
| 💻 **CodeX** | `coder`    | Groq Llama 3.3 70B | Software engineering  | Web tools, coding agents |
| ✨ **Muse**  | `creative` | Claude 3.5 Haiku   | Creative writing      | -                        |

Each agent has:

- **Isolated workspace** with separate memory and session history
- **Custom identity** (name, theme, emoji)
- **Dedicated skills** and tool configurations
- **Bootstrap files** (HEARTBEAT.md, BOOTSTRAP.md, MEMORY.md)

### Usage

```bash
# Chat with research agent (default)
openclaw --profile dev chat

# Chat with coding agent
openclaw --profile dev chat --agent coder

# Chat with creative agent
openclaw --profile dev chat --agent creative

# List all agents
openclaw --profile dev gateway call agents.list
```

### Configuration

Agents are defined in `~/.openclaw-dev/openclaw.json`:

```json
{
  "agents": {
    "list": [
      {
        "id": "research",
        "model": { "primary": "google/gemini-3-flash-preview" },
        "workspace": "~/.openclaw/workspace-research",
        "identity": {
          "name": "Atlas",
          "theme": "research assistant with deep web search expertise",
          "emoji": "🔍"
        }
      }
    ]
  }
}
```

---

## 🔧 Auto-Vulnerability Fixing

Automatically download repositories and fix security vulnerabilities using the **vuln-fix** skill:

### Quick Usage

```bash
# Clone repo and fix all vulnerabilities
"Clone https://github.com/owner/repo and fix all security vulnerabilities"
```

### Features

- **Automatic cloning** to isolated temp directories
- **Multi-package manager support** (npm, pnpm, yarn, bun)
- **Security scanning** via npm audit and Snyk
- **AI-powered fixes** using Codex/Claude coding agents
- **PR creation** with automated fix descriptions
- **Test verification** before committing

### Workflow

1. Clone repository to temp directory
2. Auto-detect package manager
3. Install dependencies
4. Scan for vulnerabilities (`npm audit`)
5. Apply automatic fixes (`npm audit fix`)
6. Launch coding agent for complex fixes
7. Run tests to verify
8. Create PR with changes

### Example

```bash
REPO="https://github.com/owner/repo.git"
TEMP=$(mktemp -d)
git clone $REPO $TEMP
cd $TEMP && npm install

# Quick fixes
npm audit fix

# AI-powered fixes for remaining issues
bash pty:true workdir:$TEMP command:"codex exec --full-auto 'Fix remaining security vulnerabilities, test, and commit'"

# Create PR
git checkout -b security/auto-fix
git push -u origin security/auto-fix
gh pr create --title "fix: resolve security vulnerabilities"
```

---

## 🛍️ ClawHub Skill Marketplace

Install community skills from [clawhub.ai](https://clawhub.ai) with automatic security scanning:

### Features

- **Semantic search** for skills (vector-based, not just keywords)
- **Automatic code scanning** on install (detects command injection, file manipulation, etc.)
- **Version control** with semver and changelogs
- **Community moderation** (auto-hide after 3+ reports)
- **Per-agent installation** for workspace isolation

### Usage

```bash
# Install ClawHub CLI
npm i -g clawhub

# Search for skills
clawhub search "postgres backup"

# Install a skill
clawhub install postgres-backup-tool

# Update all skills
clawhub update --all

# Publish your own skill
clawhub publish ./my-skill --slug my-skill --version 1.0.0
```

### Security Model

Every skill installation automatically:

1. Scans code for dangerous patterns
2. Checks binary/env requirements
3. Validates against allowlists
4. Isolates to agent workspace
5. Records version in `.clawhub/lock.json`

Agents can autonomously search and install skills with built-in protection.

---

## 📦 Installation

### Global Install (Recommended)

```bash
npm install -g openclaw@latest   # or: pnpm add -g openclaw@latest
openclaw onboard --install-daemon
```

The wizard installs the Gateway daemon (launchd/systemd) so it stays running in the background.

### Docker

```bash
docker run -d \
  -v ~/.openclaw:/root/.openclaw \
  -p 18789:18789 \
  openclaw/gateway:latest
```

### From Source

```bash
git clone https://github.com/openclaw/openclaw.git && cd openclaw
pnpm install
pnpm ui:build    # auto-installs UI deps on first run
pnpm build
pnpm openclaw onboard --install-daemon

# Dev loop (auto-reload on TS changes)
pnpm gateway:watch
```

### Development Channels

| Channel  | Tag      | Description                      |
| :------- | :------- | :------------------------------- |
| `stable` | `latest` | Tagged releases (`vYYYY.M.D`)    |
| `beta`   | `beta`   | Prereleases (`vYYYY.M.D-beta.N`) |
| `dev`    | `dev`    | Moving head of `main`            |

Switch: `openclaw update --channel stable|beta|dev`

---

## 🛡️ Security Hardening (OPENCLAW-SECURITY)

This fork includes a **comprehensive, multi-phase security hardening** pass — **120+ files changed**, **5,200+ lines added** across 8 security phases. The hardening covers process isolation, network boundary enforcement, secret redaction, capability-gated tool execution, cryptographic posture verification, and forensic incident response.

### Phase 0 — Subprocess Sandboxing

**`src/security/subprocess.ts`** — A drop-in replacement for `child_process.spawn`:

- **Executable allowlisting** — only pre-approved binaries can be spawned (`git`, `ls`, `cat`, etc.)
- **Absolute path blocking** — prevents path-traversal spawns
- **Environment scrubbing** — inherits only safe env vars; blocks `NODE_OPTIONS`, `LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`
- **Stdout/stderr byte caps** — kills processes exceeding output limits
- **Timeout enforcement** — automatic `SIGKILL` on runaway commands

```ts
import { runAllowedCommand } from "./security/subprocess.js";

const result = await runAllowedCommand({
  command: "git",
  args: ["status"],
  allowedBins: ["git", "ls", "cat"],
  timeoutMs: 5000,
  maxStdoutBytes: 1_000_000,
});
```

### Phase 1 — RFSN Policy Engine

**`src/rfsn/policy.ts`** — Capability-based access control:

| Feature                       | Description                                                      |
| :---------------------------- | :--------------------------------------------------------------- |
| Tool allowlist/denylist       | Each tool (`exec`, `browser`, `web_fetch`) is gated by policy    |
| Risk classification           | Tools categorized as `low`/`medium`/`high` risk                  |
| Capability grants             | Fine-grained: `fs:read:workspace`, `net:outbound`, `proc:manage` |
| Safe binary registry          | Whitelisted executables for `exec` tool                          |
| Fetch domain allowlisting     | Optional domain-level network allowlist with subdomain support   |
| Command substitution blocking | Prevents `$(...)` and backtick injection                         |
| Env-driven overrides          | All knobs configurable via `OPENCLAW_RFSN_*` env vars            |

### Phase 2 — Secret Redaction

**`src/rfsn/redact.ts`** + **`src/logging/redact.ts`**:

- **Pattern-based**: strips `sk-*`, `ghp_*`, `github_pat_*`, Slack `xox*`, Google `AIza*`, npm tokens
- **Bearer token stripping**: removes `Bearer <token>` from string values
- **URL sanitization**: redacts `token`, `access_token`, `api_key`, `secret`, `password` in query strings
- **Key-name detection**: any key matching `token|secret|password|authorization|cookie|api_key|bearer|jwt|session` is auto-redacted
- **DoS protection**: max depth 8, max array 64, max string 1024 chars

### Phase 3 — Network & Provider Hardening

**`src/security/provider-remote.ts`** + **`src/security/network-egress-policy.ts`**:

- **HTTPS enforcement** for all remote providers
- **SSRF protection** — validates hostnames resolve to public IPs (blocks `127.0.0.1`, `10.x.x.x`, `169.254.x.x`)
- **Protected header filtering** — strips `Authorization`, `Cookie`, `Host` from user-supplied headers
- **Network egress deny-by-default** — sandbox containers have no network unless explicitly granted

### Phase 4 — RFSN Gate & Dispatch

**`src/rfsn/gate.ts`** + **`src/rfsn/dispatch.ts`** + **`src/rfsn/wrap-tools.ts`**:

- Gate enforcement with argument-size limits, capability checks, sandbox requirements
- Dispatch hardening ensures the RFSN kernel is the **final authority** on tool execution
- Tool wrapping intercepts all tool calls to enforce policy before execution

### Phase 5 — Self-Audit & Forensics

The crown jewel of the hardening — continuous runtime integrity monitoring:

**`src/security/posture.ts`** — Posture Hash:

- Generates a deterministic SHA-256 hash of critical security config (allowlists, filesystem permissions, network mode, execution budget)
- Any configuration drift produces a different hash

**`src/security/audit-daemon.ts`** — Audit Daemon:

- Establishes a baseline posture hash at startup
- Periodically recalculates and compares against baseline
- Logs `CRITICAL` alerts on posture drift

**`src/forensics/bundle.ts`** — Incident Bundle Exporter:

- Creates a zip archive containing: manifest, configuration, posture hash, ledger, and session logs
- Used for post-incident forensic analysis

**`src/forensics/anchor.ts`** — External Tip Anchoring:

- Anchors the ledger tip hash to an external store for tamper detection
- Verifies that the ledger hasn't been truncated or modified

**`src/forensics/ledger-verify.ts`** — Ledger Integrity Verification:

- Verifies the cryptographic hash chain of the entire ledger
- Validates sidecar hash files for consistency

### Phase 6 — Infrastructure & Channel Hardening

- **Archive extraction safety** (`src/infra/archive.ts`): zip slip prevention, size quotas, entry count limits
- **Browser auth proxy** (`scripts/browser-auth-proxy.mjs`): CDP endpoint authentication
- **BlueBubbles** — full TypeScript type-safety overhaul
- **Nextcloud Talk** — request body size caps, webhook auth
- **iMessage** — binary execution allowlist
- **Skills/Plugins** — path traversal prevention, download size caps, integrity verification
- **SSH/Pairing/Update** — config permission validation, replay protection, rollback safety

### Phase 7 — Final Lockdown Layer

**`src/security/lockdown/`** — A defense-in-depth overlay:

| Module                 | Purpose                                |
| :--------------------- | :------------------------------------- |
| `executor-guard.ts`    | Final gate before subprocess execution |
| `invariants.ts`        | Runtime invariant assertions           |
| `policy-snapshot.ts`   | Immutable policy snapshots for audit   |
| `posture.ts`           | Lockdown-specific posture checks       |
| `resource-governor.ts` | Resource limits enforcement            |
| `runtime-assert.ts`    | Runtime assertion helpers              |
| `secret-scrubber.ts`   | Final-pass secret scrubbing            |

### Security Audit Summary

| ID      | Severity | Finding                                       | Status   |
| :------ | :------- | :-------------------------------------------- | :------- |
| SEC-001 | Critical | Archive extraction path traversal             | ✅ Fixed |
| SEC-002 | Critical | Embeddings SSRF + auth header override        | ✅ Fixed |
| SEC-003 | High     | Browser debug stack exposed without auth      | ✅ Fixed |
| SEC-004 | High     | WebView bridge trust boundary too broad       | ✅ Fixed |
| SEC-005 | High     | RFSN not mediating all side-effect primitives | ✅ Fixed |
| SEC-006 | Medium   | Extension services bind `0.0.0.0` by default  | ✅ Fixed |
| SEC-007 | Medium   | Nextcloud Talk webhook no body size cap       | ✅ Fixed |
| SEC-008 | Medium   | Webhook endpoints missing auth                | ✅ Fixed |
| SEC-009 | Medium   | Secrets in query strings and logs             | ✅ Fixed |
| SEC-010 | Medium   | Embeddings client allows header override      | ✅ Fixed |

### Test Coverage

Every security module includes dedicated test files:

| Test File                 | Coverage                                                     |
| :------------------------ | :----------------------------------------------------------- |
| `subprocess.test.ts`      | Executable allowlisting, env scrubbing, timeout, output caps |
| `provider-remote.test.ts` | SSRF, HTTPS enforcement, header filtering                    |
| `policy.test.ts`          | Policy creation, env override, capability resolution         |
| `redact.test.ts`          | Pattern matching, depth limits, circular refs                |
| `dispatch.test.ts`        | Gate enforcement, final authority checks                     |
| `gate.test.ts`            | Tool blocking, arg size limits, sandbox requirements         |
| `posture.test.ts`         | Posture hash determinism and config sensitivity              |
| `audit-daemon.test.ts`    | Baseline establishment, drift detection, logging             |
| `bundle.test.ts`          | Zip generation, file inclusion, manifest structure           |
| `anchor.test.ts`          | Tip anchoring and tamper detection                           |

---

## 🔧 CLI Reference

```bash
openclaw onboard              # Interactive setup wizard
openclaw gateway              # Start the gateway
openclaw agent --message "…"  # Send a message to the agent
openclaw doctor               # Health check and diagnostics
openclaw update               # Update to latest version

# Security commands
openclaw security monitor     # Start the audit daemon (foreground)
openclaw security bundle      # Export forensic incident bundle
  --session <id>              #   Session ID to bundle
  --out <dir>                 #   Output directory

# Channel management
openclaw channels login       # Link messaging channels
openclaw pairing approve      # Approve a DM pairing request
```

---

## 🧠 Model Configuration

OpenClaw supports multiple LLM providers simultaneously. Configure in `~/.openclaw/openclaw.json`:

```json5
{
  models: {
    providers: {
      anthropic: {
        baseUrl: "https://api.anthropic.com",
        api: "anthropic-messages",
        apiKey: "sk-ant-...",
        models: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"],
      },
      openai: {
        baseUrl: "https://api.openai.com/v1",
        api: "openai-responses",
        apiKey: "sk-...",
        models: ["gpt-4o", "o3-mini"],
      },
      "google-gemini": {
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        api: "google-generative-ai",
        apiKey: "AIza...",
        models: ["gemini-2.5-pro", "gemini-2.5-flash"],
      },
    },
  },
  agents: {
    defaults: {
      model: { primary: "anthropic/claude-opus-4-6" },
    },
  },
}
```

| Provider               | API Type               | Example Models                   |
| :--------------------- | :--------------------- | :------------------------------- |
| OpenAI                 | `openai-responses`     | GPT-4o, o3-mini                  |
| Anthropic              | `anthropic-messages`   | Claude Sonnet 4, Claude Opus 4.6 |
| Google Gemini          | `google-generative-ai` | Gemini 2.5 Pro, Flash            |
| DeepSeek/Groq/Together | `openai-completions`   | DeepSeek v3, Llama 3.1           |
| AWS Bedrock            | `anthropic-messages`   | Bedrock Claude models            |

---

## 🔐 Security Model

- **Default**: Tools run on the host for the `main` session (full access when it's just you).
- **Sandbox mode**: Set `agents.defaults.sandbox.mode: "non-main"` to run group/channel sessions inside per-session Docker sandboxes.
- **DM pairing**: Unknown senders receive a pairing code; approve with `openclaw pairing approve <channel> <code>`.
- **Tool isolation**: Sandbox allowlist/denylist controls which tools are available per session type.

Run `openclaw doctor` to surface risky or misconfigured security policies.

---

## 📱 Companion Apps

| Platform    | Capabilities                                                             |
| :---------- | :----------------------------------------------------------------------- |
| **macOS**   | Menu bar control, Voice Wake + PTT, WebChat, debug tools, remote gateway |
| **iOS**     | Canvas, Voice Wake, Talk Mode, camera, screen recording, Bonjour pairing |
| **Android** | Canvas, Talk Mode, camera, screen recording, optional SMS                |

All apps pair over the Gateway protocol and can execute device-local actions via `node.invoke`.

---

## 📡 Channels

Supported channels with dedicated integrations:

| Channel         | Library                | Key Config                            |
| :-------------- | :--------------------- | :------------------------------------ |
| WhatsApp        | Baileys                | `channels.whatsapp.allowFrom`         |
| Telegram        | grammY                 | `TELEGRAM_BOT_TOKEN`                  |
| Slack           | Bolt                   | `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` |
| Discord         | discord.js             | `DISCORD_BOT_TOKEN`                   |
| Google Chat     | Chat API               | `channels.googlechat`                 |
| Signal          | signal-cli             | `channels.signal`                     |
| BlueBubbles     | iMessage (recommended) | `channels.bluebubbles.serverUrl`      |
| iMessage        | Legacy macOS-only      | `channels.imessage`                   |
| Microsoft Teams | Bot Framework          | `channels.msteams`                    |
| Matrix          | Extension              | `channels.matrix`                     |
| WebChat         | Built-in               | Gateway WebSocket                     |

---

## 🌐 Remote Access

| Method               | Use Case                                       |
| :------------------- | :--------------------------------------------- |
| **Tailscale Serve**  | Tailnet-only HTTPS (default gateway identity)  |
| **Tailscale Funnel** | Public HTTPS (requires password auth)          |
| **SSH tunnels**      | Manual remote access with token auth           |
| **LAN bind**         | `gateway.bind: "lan"` for local network access |

> ⚠️ When using `lan` bind mode, always use a strong gateway token.

---

## 📚 Documentation

### Getting Started

- [Getting Started Guide](https://docs.openclaw.ai/start/getting-started) — auth, pairing, channels
- [Onboarding Wizard](https://docs.openclaw.ai/start/wizard) — step-by-step guided setup
- [FAQ](https://docs.openclaw.ai/start/faq) — common questions answered
- [Updating](https://docs.openclaw.ai/install/updating) — upgrade instructions

### Reference

- [Configuration](https://docs.openclaw.ai/gateway/configuration) — every key and example
- [Architecture](https://docs.openclaw.ai/concepts/architecture) — gateway + protocol model
- [Security Guide](https://docs.openclaw.ai/gateway/security) — security model deep-dive
- [Models](https://docs.openclaw.ai/concepts/models) — LLM provider setup
- [Model Failover](https://docs.openclaw.ai/concepts/model-failover) — OAuth vs API keys + fallbacks

### Tools & Automation

- [Browser Control](https://docs.openclaw.ai/tools/browser) — managed Chrome/Chromium with CDP
- [Skills Platform](https://docs.openclaw.ai/tools/skills) — bundled, managed, and workspace skills
- [Cron Jobs](https://docs.openclaw.ai/automation/cron-jobs) — scheduled tasks
- [Webhooks](https://docs.openclaw.ai/automation/webhook) — external trigger surface
- [Gmail Pub/Sub](https://docs.openclaw.ai/automation/gmail-pubsub) — email triggers

### Platform Guides

- [macOS](https://docs.openclaw.ai/platforms/macos) · [iOS](https://docs.openclaw.ai/platforms/ios) · [Android](https://docs.openclaw.ai/platforms/android) · [Linux](https://docs.openclaw.ai/platforms/linux) · [Windows (WSL2)](https://docs.openclaw.ai/platforms/windows)

### Operations

- [Health Checks](https://docs.openclaw.ai/gateway/health) · [Logging](https://docs.openclaw.ai/logging) · [Doctor](https://docs.openclaw.ai/gateway/doctor) · [Troubleshooting](https://docs.openclaw.ai/channels/troubleshooting)

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=openclaw/openclaw&type=date&legend=top-left)](https://www.star-history.com/#openclaw/openclaw&type=date&legend=top-left)

---

## 🤝 Community

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, maintainers, and how to submit PRs.
AI/vibe-coded PRs welcome! 🤖

Join the [Discord](https://discord.gg/clawd) to discuss features, get help, and show off your agent skills.

Special thanks to [Mario Zechner](https://mariozechner.at/) for his support and [pi-mono](https://github.com/badlogic/pi-mono).

## 👥 Contributors

Thanks to all the incredible clawtributors!

<a href="https://github.com/openclaw/openclaw/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=openclaw/openclaw" alt="Contributors" />
</a>

---

<p align="center">
  Built with 🦞 by Peter Steinberger and the community.
  <br/>
  <a href="https://openclaw.ai">openclaw.ai</a> · <a href="https://soul.md">soul.md</a> · <a href="https://steipete.me">steipete.me</a> · <a href="https://x.com/openclaw">@openclaw</a>
</p>
