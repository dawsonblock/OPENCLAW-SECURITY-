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

If you want a personal, single-user assistant that feels local, fast, always-on, and **security-hardened with capability-based access controls**, this is it.

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

### Fixer Features

- **Automatic cloning** to isolated temp directories
- **Multi-package manager support** (npm, pnpm, yarn, bun)
- **Security scanning** via npm audit and Snyk
- **AI-powered fixes** using Codex/Claude coding agents
- **PR creation** with automated fix descriptions
- **Test verification** before committing

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

### ClawHub Features

- **Semantic search** for skills (vector-based, not just keywords)
- **Automatic code scanning** on install (detects command injection, file manipulation, etc.)
- **Version control** with semver and changelogs
- **Community moderation** (auto-hide after 3+ reports)
- **Per-agent installation** for workspace isolation

### ClawHub Usage

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

## 🛡️ Security Hardening

This fork includes a **comprehensive, multi-phase security hardening** — 8 security phases covering process isolation, network boundary enforcement, secret redaction, capability-gated tool execution, and forensic incident response. See the [Threat Model](docs/threat-model.md) for the exact scope of runtime proofs.

### Phase 0 — Subprocess Sandboxing

**`src/security/subprocess.ts`** — A drop-in replacement for `child_process.spawn`:

- **Executable allowlisting** — only pre-approved binaries can be spawned (`git`, `ls`, `cat`, etc.)
- **Absolute path blocking** — prevents path-traversal spawns
- **Environment scrubbing** — inherits only safe env vars; blocks `NODE_OPTIONS`, `LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`
- **Stdout/stderr byte caps** — kills processes exceeding output limits
- **Timeout enforcement** — automatic `SIGKILL` on runaway commands

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
- **URL sanitization**: redacts query string tokens and secrets
- **Key-name detection**: any key matching `token|secret|password|authorization|cookie|api_key|bearer|jwt|session` is auto-redacted
- **DoS protection**: max depth 8, max array 64, max string 1024 chars

### Phase 3 — Network & Provider Hardening

**`src/security/provider-remote.ts`** + **`src/security/network-egress-policy.ts`**:

- **HTTPS enforcement** for all remote providers
- **SSRF protection** — validates hostnames resolve to public IPs (blocks `127.0.0.1`, `10.x.x.x`, `169.254.x.x`)
- **Protected header filtering** — strips `Authorization`, `Cookie`, `Host` from user-supplied headers
- **Network egress policy validation** — software-level deny-by-default

### Phase 4 — RFSN Gate & Dispatch

**`src/rfsn/gate.ts`** + **`src/rfsn/dispatch.ts`** + **`src/rfsn/wrap-tools.ts`**:

- Gate enforcement with argument-size limits, capability checks, sandbox requirements
- Dispatch hardening ensures the RFSN kernel is the **final authority** on tool execution
- Tool wrapping intercepts all tool calls to enforce policy before execution

### Phase 5 — Self-Audit & Forensics

**`src/security/posture.ts`** — Posture Hash:

- Generates deterministic SHA-256 hash of critical security config
- Any configuration drift produces a different hash

**`src/security/audit-daemon.ts`** — Audit Daemon:

- Establishes baseline posture hash at startup
- Periodically recalculates and detects drift
- Logs `CRITICAL` alerts on posture changes

**`src/forensics/`** — Forensic Bundle & Anchoring:

- Create incident bundles with config, ledger, and logs
- Optional external anchoring for tamper detection
- Cryptographic ledger verification

### Phase 6 — Infrastructure & Channel Hardening

- **Archive extraction safety**: zip slip prevention, size quotas, entry count limits
- **Browser auth proxy**: CDP endpoint authentication
- **Channel-specific hardening**: Path traversal prevention, auth validation
- **Skills/Plugins**: Safe execution isolation, download size caps

### Phase 7 — Final Lockdown Layer

**`src/security/lockdown/`** — Defense-in-depth overlay:

- Runtime invariant assertions
- Policy snapshot + drift checks
- Resource governors
- Final-pass secret scrubbing

### Phase 8 — Build & Performance Optimization

- **Build reorganization**: Consolidated config files into `config/` directories
- **Runtime performance**: 70-80% test speedup through HTTP Keep-Alive fixes
- **Strict typing**: Zero `tsc --noEmit` errors

---

## 🔒 Security & Testing

### Runtime-Proven Guarantees

The current branch has a real security spine, but the runtime proof is intentionally narrower than the full schema and helper surface.

High-value validation surfaces:

| Guarantee | Evidence |
|-----------|----------|
| Dangerous node-command denial in live kernel-gate flow | `src/gateway/node-command-kernel-gate.runtime.test.ts` |
| Browser proxy root containment through live file boundary | `src/node-host/browser-proxy.runtime.test.ts`, `src/node-host/browser-containment.integration.test.ts` |
| Canonical gateway health/status payload | `src/commands/health.ts`, `src/runtime/runtime-truth.smoke.test.ts` |
| Lightweight recovery and `.bak` restore behavior | `src/runtime/recovery.ts`, `src/runtime/runtime-truth.smoke.test.ts` |
| Safe-mode guarantees that the runtime actually enforces | `src/runtime/safe-mode.structural.test.ts` |
| Authority-boundary governance for reviewed runtime roots | `src/security/authority-boundaries.test.ts`, `src/security/authority-boundary-importers.test.ts` |

**Focused validation**:
```bash
pnpm security:check
./scripts/fast-smoke.sh
```

### What Is Proven Today

- **Safe mode**: `OPENCLAW_SAFE_MODE=1` forces loopback bind, clears explicit host override, denies dangerous node commands, disables insecure control-UI auth bypasses, and is surfaced in the canonical health payload. It persists via a `.safe_mode` marker file.
- **Gateway binding enforcement**: dangerous node commands are denied unless the reviewed conditions are met.
- **Browser containment**: browser proxy reads stay inside approved roots and reject outside-root escapes, including symlink escapes.
- **Startup validation**: startup invariants are checked before the runtime reports ready.
- **Lightweight recovery**: recovery triggers safe mode, restores `config.json.bak` when present, and writes a sanitized local report.
- **Authority boundaries**: importer governance remains scoped to the reviewed runtime roots in `src/` and `extensions/`.

---

## ✅ Operational Reality

This branch is hardened and test-backed, but the live operator contract is narrower than earlier drafts of the docs implied.

### Live Security Events

Structured event schemas cover more cases than the runtime currently emits. The events that are wired on live paths in this branch are:

- `dangerous-path-denied`
- `dangerous-path-allowed`
- `browser-proxy-rejected`
- `gateway-startup-invariant-failed`

These events are emitted as compact JSON log lines when `OPENCLAW_SECURITY_EVENTS_ENABLED=1` is left at its default enabled value.

### Canonical Health Path

The canonical health surface is the **gateway method/RPC** path consumed by:

- `openclaw health`
- `openclaw health --json`
- `openclaw status --deep`

It reports:

- `alive`
- `ready`
- `degraded`
- `safeMode`
- `status`
- readiness blockers
- degraded subsystems

Helper HTTP health endpoint files exist in the tree, but they are not the documented live operator contract unless they are explicitly mounted by the runtime.

### Startup Doctor

```bash
openclaw doctor
```

Checks:
- Authority boundary config loaded
- Scan scope roots readable
- Workspace paths accessible
- Gateway auth configured
- Optional features reported as optional

### Fast Confidence & Release Gate

```bash
pnpm release:gate
```

This is the canonical release gate that verifies structural security, determinism, threat model requirements, config backward-compatibility, and operational failure modes.

### Pre-Deployment Checklist

```bash
# 1. Run startup checks
openclaw doctor

# 2. Run the canonical release gate and confidence pass
pnpm release:gate

# 3. Check canonical health through the gateway method
openclaw health --json
```

### Post-Deployment Monitoring

```bash
# Tail live security events
tail -f /tmp/openclaw/openclaw-*.log | jq '.security_event'

# Check canonical health/status output
openclaw health --json | jq '.status, .safeMode, .degradedSubsystems'
```

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

- [Operational Maturity Guide](OPERATIONAL_MATURITY_GUIDE.md) — Production readiness, deployment, monitoring
- [Operator Quick Reference](OPERATOR_QUICK_REFERENCE.md) — Quick commands and scenarios
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
