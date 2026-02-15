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

**OpenClaw** is a personal AI assistant that runs on your devices, for you. It connects to the channels you already use (WhatsApp, Slack, Discord, Signal, iMessage) and provides a unified, secure intelligence layer over your digital life.

[Website](https://openclaw.ai) · [Docs](https://docs.openclaw.ai) · [Getting Started](https://docs.openclaw.ai/start/getting-started) · [Discord](https://discord.gg/clawd)

## 🚀 Features

| Capability         | Description                                                                                            |
| :----------------- | :----------------------------------------------------------------------------------------------------- |
| **Local-First**    | The Gateway runs on your machine. Your data, your rules.                                               |
| **Multi-Channel**  | Talk to your agent via WhatsApp, Telegram, Slack, Discord, Signal, iMessage, and more.                 |
| **Voice & Vision** | Always-on **Voice Wake** and **Talk Mode** for macOS/iOS/Android. **Canvas** for visual collaboration. |
| **Powerful Tools** | Browser control, file system access, cron jobs, and a full plugin system.                              |
| **Multi-Agent**    | Route different chats to different agent personas with isolated memory and tools.                      |

## 🛡️ Security Hardening (Phase 5 Complete)

This fork implements a **comprehensive security hardening** suite to ensure OpenClaw is safe for sensitive environments.

### 🔒 Core Security Features

- **Execution Containment**: Strict `subprocess` allows only allowlisted binaries (`git`, `ls`, etc.) with argument sanitization and resource limits.
- **Network Lockdown**: RFSN Policy Engine enforces a strict deny-by-default network policy. Only allowlisted domains are accessible.
- **Secret Redaction**: Automatic redaction of API keys, tokens, and sensitive patterns from all logs and ledgers.
- **Forensics & Audit**:
  - **Audit Daemon**: Continuously monitors security posture (file permissions, config hashes) and alerts on drift.
  - **Posture Hashing**: Cryptographic verification of the runtime security state.
  - **Incident Bundles**: Export encrypted forensic bundles (`openclaw security bundle <session-id>`) for analysis.

## ⚡ Quick Start

Requires **Node.js ≥ 22**.

```bash
# Install globally
npm install -g openclaw@latest

# Run the interactive setup wizard
openclaw onboard --install-daemon
```

Then talk to your agent!

```bash
# Send a test message
openclaw agent --message "Hello from the CLI!"
```

## 📦 Installation Options

### Docker (Recommended for Server)

Run the Gateway in a hardened container.

```bash
docker run -d \
  -v ~/.openclaw:/root/.openclaw \
  -p 18789:18789 \
  openclaw/gateway:latest
```

### Source (Development)

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install
pnpm build
pnpm openclaw onboard --install-daemon
```

## 📚 Documentation

- [**Getting Started**](https://docs.openclaw.ai/start/getting-started): Authentication, pairing, and basic usage.
- [**Configuration**](https://docs.openclaw.ai/gateway/configuration): Full reference for `openclaw.json`.
- [**Security Guide**](https://docs.openclaw.ai/gateway/security): Deep dive into the security model and best practices.
- [**Model Setup**](https://docs.openclaw.ai/concepts/models): configuring OpenAI, Anthropic, Gemini, DeepSeek, and local LLMs.

## 🤝 Community

Join the [Discord](https://discord.gg/clawd) to discuss features, get help, and show off your agent skills.

## 👥 Contributors

Thanks to the incredible community for building OpenClaw!

<a href="https://github.com/openclaw/openclaw/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=openclaw/openclaw" alt="Contributors" />
</a>
