---
summary: "CLI reference for `aetherbot hooks` (agent hooks)"
read_when:
  - You want to manage agent hooks
  - You want to install or update hooks
title: "hooks"
---

# `aetherbot hooks`

Manage agent hooks (event-driven automations for commands like `/new`, `/reset`, and gateway startup).

Related:

- Hooks: [Hooks](/automation/hooks)
- Plugin hooks: [Plugins](/tools/plugin#plugin-hooks)

## List All Hooks

```bash
aetherbot hooks list
```

List all discovered hooks from workspace, managed, and bundled directories.

**Options:**

- `--eligible`: Show only eligible hooks (requirements met)
- `--json`: Output as JSON
- `-v, --verbose`: Show detailed information including missing requirements

**Example output:**

```
Hooks (4/4 ready)

Ready:
  🚀 boot-md ✓ - Run BOOT.md on gateway startup
  📝 command-logger ✓ - Log all command events to a centralized audit file
  💾 session-memory ✓ - Save session context to memory when /new command is issued
  😈 soul-evil ✓ - Swap injected SOUL content during a purge window or by random chance
```

**Example (verbose):**

```bash
aetherbot hooks list --verbose
```

Shows missing requirements for ineligible hooks.

**Example (JSON):**

```bash
aetherbot hooks list --json
```

Returns structured JSON for programmatic use.

## Get Hook Information

```bash
aetherbot hooks info <name>
```

Show detailed information about a specific hook.

**Arguments:**

- `<name>`: Hook name (e.g., `session-memory`)

**Options:**

- `--json`: Output as JSON

**Example:**

```bash
aetherbot hooks info session-memory
```

**Output:**

```
💾 session-memory ✓ Ready

Save session context to memory when /new command is issued

Details:
  Source: openclaw-bundled
  Path: /path/to/openclaw/hooks/bundled/session-memory/HOOK.md
  Handler: /path/to/openclaw/hooks/bundled/session-memory/handler.ts
  Homepage: https://docs.openclaw.ai/hooks#session-memory
  Events: command:new

Requirements:
  Config: ✓ workspace.dir
```

## Check Hooks Eligibility

```bash
aetherbot hooks check
```

Show summary of hook eligibility status (how many are ready vs. not ready).

**Options:**

- `--json`: Output as JSON

**Example output:**

```
Hooks Status

Total hooks: 4
Ready: 4
Not ready: 0
```

## Enable a Hook

```bash
aetherbot hooks enable <name>
```

Enable a specific hook by adding it to your config (`~/.openclaw/config.json`).

**Note:** Hooks managed by plugins show `plugin:<id>` in `aetherbot hooks list` and
can’t be enabled/disabled here. Enable/disable the plugin instead.

**Arguments:**

- `<name>`: Hook name (e.g., `session-memory`)

**Example:**

```bash
aetherbot hooks enable session-memory
```

**Output:**

```
✓ Enabled hook: 💾 session-memory
```

**What it does:**

- Checks if hook exists and is eligible
- Updates `hooks.internal.entries.<name>.enabled = true` in your config
- Saves config to disk

**After enabling:**

- Restart the gateway so hooks reload (menu bar app restart on macOS, or restart your gateway process in dev).

## Disable a Hook

```bash
aetherbot hooks disable <name>
```

Disable a specific hook by updating your config.

**Arguments:**

- `<name>`: Hook name (e.g., `command-logger`)

**Example:**

```bash
aetherbot hooks disable command-logger
```

**Output:**

```
⏸ Disabled hook: 📝 command-logger
```

**After disabling:**

- Restart the gateway so hooks reload

## Install Hooks

```bash
aetherbot hooks install <path-or-spec>
```

Install a hook pack from a local folder/archive or npm.

**What it does:**

- Copies the hook pack into `~/.openclaw/hooks/<id>`
- Enables the installed hooks in `hooks.internal.entries.*`
- Records the install under `hooks.internal.installs`

**Options:**

- `-l, --link`: Link a local directory instead of copying (adds it to `hooks.internal.load.extraDirs`)

**Supported archives:** `.zip`, `.tgz`, `.tar.gz`, `.tar`

**Examples:**

```bash
# Local directory
aetherbot hooks install ./my-hook-pack

# Local archive
aetherbot hooks install ./my-hook-pack.zip

# NPM package
aetherbot hooks install @openclaw/my-hook-pack

# Link a local directory without copying
aetherbot hooks install -l ./my-hook-pack
```

## Update Hooks

```bash
aetherbot hooks update <id>
aetherbot hooks update --all
```

Update installed hook packs (npm installs only).

**Options:**

- `--all`: Update all tracked hook packs
- `--dry-run`: Show what would change without writing

## Bundled Hooks

### session-memory

Saves session context to memory when you issue `/new`.

**Enable:**

```bash
aetherbot hooks enable session-memory
```

**Output:** `~/.openclaw/workspace/memory/YYYY-MM-DD-slug.md`

**See:** [session-memory documentation](/automation/hooks#session-memory)

### command-logger

Logs all command events to a centralized audit file.

**Enable:**

```bash
aetherbot hooks enable command-logger
```

**Output:** `~/.openclaw/logs/commands.log`

**View logs:**

```bash
# Recent commands
tail -n 20 ~/.openclaw/logs/commands.log

# Pretty-print
cat ~/.openclaw/logs/commands.log | jq .

# Filter by action
grep '"action":"new"' ~/.openclaw/logs/commands.log | jq .
```

**See:** [command-logger documentation](/automation/hooks#command-logger)

### soul-evil

Swaps injected `SOUL.md` content with `SOUL_EVIL.md` during a purge window or by random chance.

**Enable:**

```bash
aetherbot hooks enable soul-evil
```

**See:** [SOUL Evil Hook](/hooks/soul-evil)

### boot-md

Runs `BOOT.md` when the gateway starts (after channels start).

**Events**: `gateway:startup`

**Enable**:

```bash
aetherbot hooks enable boot-md
```

**See:** [boot-md documentation](/automation/hooks#boot-md)
