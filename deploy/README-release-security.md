# OpenClaw Release Security Invariants

Use this checklist for hardened deployments:

1. Build and publish images by immutable digest, not mutable tags.
2. Sign release images with cosign in CI.
3. Apply `/deploy/kyverno/require-signed-images.yaml` before rollout.
4. Ship `policy.json` and `policy.json.sig` together.
5. Start runtime with:
   - `OPENCLAW_VERIFY_POLICY=1`
   - `OPENCLAW_POLICY_PATH=/app/policy/policy.json`
   - `OPENCLAW_POLICY_PUBKEY=<public key pem>`
6. Keep sandbox network default at `none` unless a dedicated, policy-gated egress path is used.
