---
summary: "CLI reference for `aetherbot voicecall` (voice-call plugin command surface)"
read_when:
  - You use the voice-call plugin and want the CLI entry points
  - You want quick examples for `voicecall call|continue|status|tail|expose`
title: "voicecall"
---

# `aetherbot voicecall`

`voicecall` is a plugin-provided command. It only appears if the voice-call plugin is installed and enabled.

Primary doc:

- Voice-call plugin: [Voice Call](/plugins/voice-call)

## Common commands

```bash
aetherbot voicecall status --call-id <id>
aetherbot voicecall call --to "+15555550123" --message "Hello" --mode notify
aetherbot voicecall continue --call-id <id> --message "Any questions?"
aetherbot voicecall end --call-id <id>
```

## Exposing webhooks (Tailscale)

```bash
aetherbot voicecall expose --mode serve
aetherbot voicecall expose --mode funnel
aetherbot voicecall unexpose
```

Security note: only expose the webhook endpoint to networks you trust. Prefer Tailscale Serve over Funnel when possible.
