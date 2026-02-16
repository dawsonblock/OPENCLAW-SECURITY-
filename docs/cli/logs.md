---
summary: "CLI reference for `aetherbot logs` (tail gateway logs via RPC)"
read_when:
  - You need to tail Gateway logs remotely (without SSH)
  - You want JSON log lines for tooling
title: "logs"
---

# `aetherbot logs`

Tail Gateway file logs over RPC (works in remote mode).

Related:

- Logging overview: [Logging](/logging)

## Examples

```bash
aetherbot logs
aetherbot logs --follow
aetherbot logs --json
aetherbot logs --limit 500
```
