---
summary: "CLI reference for `aetherbot agents` (list/add/delete/set identity)"
read_when:
  - You want multiple isolated agents (workspaces + routing + auth)
title: "agents"
---

# `aetherbot agents`

Manage isolated agents (workspaces + auth + routing).

Related:

- Multi-agent routing: [Multi-Agent Routing](/concepts/multi-agent)
- Agent workspace: [Agent workspace](/concepts/agent-workspace)

## Examples

```bash
aetherbot agents list
aetherbot agents add work --workspace ~/.openclaw/workspace-work
aetherbot agents set-identity --workspace ~/.openclaw/workspace --from-identity
aetherbot agents set-identity --agent main --avatar avatars/openclaw.png
aetherbot agents delete work
```

## Identity files

Each agent workspace can include an `IDENTITY.md` at the workspace root:

- Example path: `~/.openclaw/workspace/IDENTITY.md`
- `set-identity --from-identity` reads from the workspace root (or an explicit `--identity-file`)

Avatar paths resolve relative to the workspace root.

## Set identity

`set-identity` writes fields into `agents.list[].identity`:

- `name`
- `theme`
- `emoji`
- `avatar` (workspace-relative path, http(s) URL, or data URI)

Load from `IDENTITY.md`:

```bash
aetherbot agents set-identity --workspace ~/.openclaw/workspace --from-identity
```

Override fields explicitly:

```bash
aetherbot agents set-identity --agent main --name "AetherBot" --emoji "🦞" --avatar avatars/openclaw.png
```

Config sample:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "AetherBot",
          theme: "space lobster",
          emoji: "🦞",
          avatar: "avatars/openclaw.png",
        },
      },
    ],
  },
}
```
