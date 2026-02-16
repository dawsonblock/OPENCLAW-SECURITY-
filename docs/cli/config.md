---
summary: "CLI reference for `aetherbot config` (get/set/unset config values)"
read_when:
  - You want to read or edit config non-interactively
title: "config"
---

# `aetherbot config`

Config helpers: get/set/unset values by path. Run without a subcommand to open
the configure wizard (same as `aetherbot configure`).

## Examples

```bash
aetherbot config get browser.executablePath
aetherbot config set browser.executablePath "/usr/bin/google-chrome"
aetherbot config set agents.defaults.heartbeat.every "2h"
aetherbot config set agents.list[0].tools.exec.node "node-id-or-name"
aetherbot config unset tools.web.search.apiKey
```

## Paths

Paths use dot or bracket notation:

```bash
aetherbot config get agents.defaults.workspace
aetherbot config get agents.list[0].id
```

Use the agent list index to target a specific agent:

```bash
aetherbot config get agents.list
aetherbot config set agents.list[1].tools.exec.node "node-id-or-name"
```

## Values

Values are parsed as JSON5 when possible; otherwise they are treated as strings.
Use `--json` to require JSON5 parsing.

```bash
aetherbot config set agents.defaults.heartbeat.every "0m"
aetherbot config set gateway.port 19001 --json
aetherbot config set channels.whatsapp.groups '["*"]' --json
```

Restart the gateway after edits.
