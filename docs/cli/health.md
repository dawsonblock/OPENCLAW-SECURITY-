---
summary: "CLI reference for `openclaw health` (gateway health method via RPC)"
read_when:
  - You want to quickly check the running Gateway’s health
title: "health"
---

# `openclaw health`

Fetch the canonical gateway health snapshot from the running Gateway.

```bash
openclaw health
openclaw health --json
openclaw health --verbose
```

Notes:

- This command uses the gateway method/RPC health surface. It does not depend on a mounted `/health` HTTP route.
- `--verbose` runs live probes and prints per-account timings when multiple accounts are configured.
- Output includes per-agent session stores when multiple agents are configured.
