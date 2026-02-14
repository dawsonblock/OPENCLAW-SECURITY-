import path from "node:path";
import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import { listDevicePairing } from "../../infra/device-pairing.js";
import {
  approveNodePairing,
  listNodePairing,
  rejectNodePairing,
  renamePairedNode,
  requestNodePairing,
  verifyNodeToken,
} from "../../infra/node-pairing.js";
import {
  computeCapabilityApprovalBindHash,
  computeNodeInvokeApprovalPayloadHash,
} from "../../security/capability-approval.js";
import {
  isBreakGlassEnvEnabled,
  resolveNodeCommandCapabilityPolicy,
} from "../../security/capability-registry.js";
import { resolveWorkspaceRoot, validateExecCwd } from "../../security/cwd-containment.js";
import { DangerousActionLimiter } from "../../security/dangerous-action-limiter.js";
import { appendDangerousLedgerEntry } from "../../security/dangerous-ledger.js";
import { clampTimeoutMs, resolveExecBudget } from "../../security/exec-budgets.js";
import { isArbitraryEnvAllowed, sanitizeExecEnv } from "../../security/exec-env-allowlist.js";
import {
  acquireDangerousSlot,
  releaseDangerousSlot,
} from "../../security/lockdown/resource-governor.js";
import { assertDangerousCapabilityInvariants } from "../../security/lockdown/runtime-assert.js";
import { hashPayload } from "../../security/stable-hash.js";
import { isSafeExposure } from "../../security/startup-validator.js";
import { validateSystemRunCommand } from "../../security/system-run-constraints.js";
import { resolveGatewayBindHost } from "../net.js";
import { invokeNodeCommandWithKernelGate } from "../node-command-kernel-gate.js";
import {
  ErrorCodes,
  errorShape,
  validateNodeDescribeParams,
  validateNodeEventParams,
  validateNodeInvokeParams,
  validateNodeInvokeResultParams,
  validateNodeListParams,
  validateNodePairApproveParams,
  validateNodePairListParams,
  validateNodePairRejectParams,
  validateNodePairRequestParams,
  validateNodePairVerifyParams,
  validateNodeRenameParams,
} from "../protocol/index.js";
import {
  respondInvalidParams,
  respondUnavailableOnThrow,
  safeParseJson,
  uniqueSortedStrings,
} from "./nodes.helpers.js";

const dangerousActionLimiter = new DangerousActionLimiter();

function isNodeEntry(entry: { role?: string; roles?: string[] }) {
  if (entry.role === "node") {
    return true;
  }
  if (Array.isArray(entry.roles) && entry.roles.includes("node")) {
    return true;
  }
  return false;
}

function hasAdminScope(client: { connect?: { role?: string; scopes?: string[] } } | null): boolean {
  const role = client?.connect?.role ?? "operator";
  if (role !== "operator") {
    return false;
  }
  const scopes = Array.isArray(client?.connect?.scopes) ? client.connect.scopes : [];
  return scopes.includes("operator.admin");
}

function resolveDangerousSessionKey(params: unknown): string | null {
  if (!params || typeof params !== "object") {
    return null;
  }
  const sessionKey = (params as Record<string, unknown>).sessionKey;
  if (typeof sessionKey !== "string" || !sessionKey.trim()) {
    return null;
  }
  return sessionKey.trim();
}

function resolveRateLimitKey(
  command: string,
  params: unknown,
  client: { connect?: { client?: { id?: string }; device?: { id?: string } } } | null,
): string {
  const sessionKey = resolveDangerousSessionKey(params);
  if (sessionKey) {
    return `session:${sessionKey}`;
  }
  const clientId = client?.connect?.client?.id;
  if (typeof clientId === "string" && clientId.trim()) {
    return `client:${clientId}`;
  }
  const deviceId = client?.connect?.device?.id;
  if (typeof deviceId === "string" && deviceId.trim()) {
    return `device:${deviceId}`;
  }
  return `command:${command}`;
}

function breakGlassMessage(command: string, key: string): string {
  if (command === "system.execApprovals.set") {
    return `policy mutation is disabled; set ${key}=1`;
  }
  if (command === "browser.proxy") {
    return `browser.proxy is disabled; set ${key}=1`;
  }
  return `${command} is disabled; set ${key}=1`;
}

function resolveDangerousPayloadHash(nodeId: string, command: string, params: unknown): string {
  return computeNodeInvokeApprovalPayloadHash({
    nodeId,
    command,
    payload: params,
  });
}

function resolveDangerousLedgerBaseDir(
  context: Parameters<GatewayRequestHandlers["node.invoke"]>[0]["context"],
): string {
  return path.resolve(path.dirname(context.cronStorePath), "security");
}

function hashSessionKeyForLedger(sessionKey: string | null): string | null {
  if (!sessionKey) {
    return null;
  }
  return hashPayload({ sessionKey });
}

function normalizeCommandEnv(env: unknown): Record<string, string> | null {
  if (!env || typeof env !== "object") {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
    if (!key.trim() || typeof value !== "string") {
      continue;
    }
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function resolveCapabilityApprovalToken(params: unknown): string {
  if (!params || typeof params !== "object") {
    return "";
  }
  const record = params as Record<string, unknown>;
  const candidate = [record.capabilityApprovalToken, record.approvalToken];
  for (const value of candidate) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function sanitizeCapabilityApprovalTokenParams(params: unknown): unknown {
  if (!params || typeof params !== "object") {
    return params;
  }
  const out = { ...(params as Record<string, unknown>) };
  delete out.capabilityApprovalToken;
  return out;
}

function resolveAgentIdFromParams(params: unknown): string | null {
  if (!params || typeof params !== "object") {
    return null;
  }
  const raw = (params as Record<string, unknown>).agentId;
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  return raw.trim();
}

function resolveSystemRunInputs(params: unknown): {
  rawCommand: string | null;
  argv: string[] | null;
} {
  if (!params || typeof params !== "object") {
    return { rawCommand: null, argv: null };
  }
  const record = params as Record<string, unknown>;
  const rawCommand =
    typeof record.rawCommand === "string" && record.rawCommand.trim()
      ? record.rawCommand
      : typeof record.command === "string" && record.command.trim()
        ? record.command
        : null;
  const argv = Array.isArray(record.command) ? record.command.map((entry) => String(entry)) : null;
  return { rawCommand, argv };
}

function normalizeNodeInvokeResultParams(params: unknown): unknown {
  if (!params || typeof params !== "object") {
    return params;
  }
  const raw = params as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...raw };
  if (normalized.payloadJSON === null) {
    delete normalized.payloadJSON;
  } else if (normalized.payloadJSON !== undefined && typeof normalized.payloadJSON !== "string") {
    if (normalized.payload === undefined) {
      normalized.payload = normalized.payloadJSON;
    }
    delete normalized.payloadJSON;
  }
  if (normalized.error === null) {
    delete normalized.error;
  }
  return normalized;
}

function stripBypassFlags(params: unknown): unknown {
  if (!params || typeof params !== "object") {
    return params;
  }
  const out = { ...(params as Record<string, unknown>) };
  delete out.approved;
  delete out.approvalDecision;
  delete out.approvalToken;
  return out;
}

export const nodeHandlers: GatewayRequestHandlers = {
  "node.pair.request": async ({ params, respond, context }) => {
    if (!validateNodePairRequestParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.pair.request",
        validator: validateNodePairRequestParams,
      });
      return;
    }
    const p = params as {
      nodeId: string;
      displayName?: string;
      platform?: string;
      version?: string;
      coreVersion?: string;
      uiVersion?: string;
      deviceFamily?: string;
      modelIdentifier?: string;
      caps?: string[];
      commands?: string[];
      remoteIp?: string;
      silent?: boolean;
    };
    await respondUnavailableOnThrow(respond, async () => {
      const result = await requestNodePairing({
        nodeId: p.nodeId,
        displayName: p.displayName,
        platform: p.platform,
        version: p.version,
        coreVersion: p.coreVersion,
        uiVersion: p.uiVersion,
        deviceFamily: p.deviceFamily,
        modelIdentifier: p.modelIdentifier,
        caps: p.caps,
        commands: p.commands,
        remoteIp: p.remoteIp,
        silent: p.silent,
      });
      if (result.status === "pending" && result.created) {
        context.broadcast("node.pair.requested", result.request, {
          dropIfSlow: true,
        });
      }
      respond(true, result, undefined);
    });
  },
  "node.pair.list": async ({ params, respond }) => {
    if (!validateNodePairListParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.pair.list",
        validator: validateNodePairListParams,
      });
      return;
    }
    await respondUnavailableOnThrow(respond, async () => {
      const list = await listNodePairing();
      respond(true, list, undefined);
    });
  },
  "node.pair.approve": async ({ params, respond, context }) => {
    if (!validateNodePairApproveParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.pair.approve",
        validator: validateNodePairApproveParams,
      });
      return;
    }
    const { requestId } = params as { requestId: string };
    await respondUnavailableOnThrow(respond, async () => {
      const approved = await approveNodePairing(requestId);
      if (!approved) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown requestId"));
        return;
      }
      context.broadcast(
        "node.pair.resolved",
        {
          requestId,
          nodeId: approved.node.nodeId,
          decision: "approved",
          ts: Date.now(),
        },
        { dropIfSlow: true },
      );
      respond(true, approved, undefined);
    });
  },
  "node.pair.reject": async ({ params, respond, context }) => {
    if (!validateNodePairRejectParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.pair.reject",
        validator: validateNodePairRejectParams,
      });
      return;
    }
    const { requestId } = params as { requestId: string };
    await respondUnavailableOnThrow(respond, async () => {
      const rejected = await rejectNodePairing(requestId);
      if (!rejected) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown requestId"));
        return;
      }
      context.broadcast(
        "node.pair.resolved",
        {
          requestId,
          nodeId: rejected.nodeId,
          decision: "rejected",
          ts: Date.now(),
        },
        { dropIfSlow: true },
      );
      respond(true, rejected, undefined);
    });
  },
  "node.pair.verify": async ({ params, respond }) => {
    if (!validateNodePairVerifyParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.pair.verify",
        validator: validateNodePairVerifyParams,
      });
      return;
    }
    const { nodeId, token } = params as {
      nodeId: string;
      token: string;
    };
    await respondUnavailableOnThrow(respond, async () => {
      const result = await verifyNodeToken(nodeId, token);
      respond(true, result, undefined);
    });
  },
  "node.rename": async ({ params, respond }) => {
    if (!validateNodeRenameParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.rename",
        validator: validateNodeRenameParams,
      });
      return;
    }
    const { nodeId, displayName } = params as {
      nodeId: string;
      displayName: string;
    };
    await respondUnavailableOnThrow(respond, async () => {
      const trimmed = displayName.trim();
      if (!trimmed) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "displayName required"));
        return;
      }
      const updated = await renamePairedNode(nodeId, trimmed);
      if (!updated) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown nodeId"));
        return;
      }
      respond(true, { nodeId: updated.nodeId, displayName: updated.displayName }, undefined);
    });
  },
  "node.list": async ({ params, respond, context }) => {
    if (!validateNodeListParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.list",
        validator: validateNodeListParams,
      });
      return;
    }
    await respondUnavailableOnThrow(respond, async () => {
      const list = await listDevicePairing();
      const pairedById = new Map(
        list.paired
          .filter((entry) => isNodeEntry(entry))
          .map((entry) => [
            entry.deviceId,
            {
              nodeId: entry.deviceId,
              displayName: entry.displayName,
              platform: entry.platform,
              version: undefined,
              coreVersion: undefined,
              uiVersion: undefined,
              deviceFamily: undefined,
              modelIdentifier: undefined,
              remoteIp: entry.remoteIp,
              caps: [],
              commands: [],
              permissions: undefined,
            },
          ]),
      );
      const connected = context.nodeRegistry.listConnected();
      const connectedById = new Map(connected.map((n) => [n.nodeId, n]));
      const nodeIds = new Set<string>([...pairedById.keys(), ...connectedById.keys()]);

      const nodes = [...nodeIds].map((nodeId) => {
        const paired = pairedById.get(nodeId);
        const live = connectedById.get(nodeId);

        const caps = uniqueSortedStrings([...(live?.caps ?? paired?.caps ?? [])]);
        const commands = uniqueSortedStrings([...(live?.commands ?? paired?.commands ?? [])]);

        return {
          nodeId,
          displayName: live?.displayName ?? paired?.displayName,
          platform: live?.platform ?? paired?.platform,
          version: live?.version ?? paired?.version,
          coreVersion: live?.coreVersion ?? paired?.coreVersion,
          uiVersion: live?.uiVersion ?? paired?.uiVersion,
          deviceFamily: live?.deviceFamily ?? paired?.deviceFamily,
          modelIdentifier: live?.modelIdentifier ?? paired?.modelIdentifier,
          remoteIp: live?.remoteIp ?? paired?.remoteIp,
          caps,
          commands,
          pathEnv: live?.pathEnv,
          permissions: live?.permissions ?? paired?.permissions,
          connectedAtMs: live?.connectedAtMs,
          paired: Boolean(paired),
          connected: Boolean(live),
        };
      });

      nodes.sort((a, b) => {
        if (a.connected !== b.connected) {
          return a.connected ? -1 : 1;
        }
        const an = (a.displayName ?? a.nodeId).toLowerCase();
        const bn = (b.displayName ?? b.nodeId).toLowerCase();
        if (an < bn) {
          return -1;
        }
        if (an > bn) {
          return 1;
        }
        return a.nodeId.localeCompare(b.nodeId);
      });

      respond(true, { ts: Date.now(), nodes }, undefined);
    });
  },
  "node.describe": async ({ params, respond, context }) => {
    if (!validateNodeDescribeParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.describe",
        validator: validateNodeDescribeParams,
      });
      return;
    }
    const { nodeId } = params as { nodeId: string };
    const id = String(nodeId ?? "").trim();
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "nodeId required"));
      return;
    }
    await respondUnavailableOnThrow(respond, async () => {
      const list = await listDevicePairing();
      const paired = list.paired.find((n) => n.deviceId === id && isNodeEntry(n));
      const connected = context.nodeRegistry.listConnected();
      const live = connected.find((n) => n.nodeId === id);

      if (!paired && !live) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown nodeId"));
        return;
      }

      const caps = uniqueSortedStrings([...(live?.caps ?? [])]);
      const commands = uniqueSortedStrings([...(live?.commands ?? [])]);

      respond(
        true,
        {
          ts: Date.now(),
          nodeId: id,
          displayName: live?.displayName ?? paired?.displayName,
          platform: live?.platform ?? paired?.platform,
          version: live?.version,
          coreVersion: live?.coreVersion,
          uiVersion: live?.uiVersion,
          deviceFamily: live?.deviceFamily,
          modelIdentifier: live?.modelIdentifier,
          remoteIp: live?.remoteIp ?? paired?.remoteIp,
          caps,
          commands,
          pathEnv: live?.pathEnv,
          permissions: live?.permissions,
          connectedAtMs: live?.connectedAtMs,
          paired: Boolean(paired),
          connected: Boolean(live),
        },
        undefined,
      );
    });
  },
  "node.invoke": async ({ params, respond, context, client }) => {
    if (!validateNodeInvokeParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.invoke",
        validator: validateNodeInvokeParams,
      });
      return;
    }
    const p = params as {
      nodeId: string;
      command: string;
      params?: unknown;
      timeoutMs?: number;
      idempotencyKey: string;
    };
    const nodeId = String(p.nodeId ?? "").trim();
    const command = String(p.command ?? "").trim();
    if (!nodeId || !command) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "nodeId and command required"),
      );
      return;
    }
    // ── Strip legacy bypass flags unconditionally ──
    p.params = stripBypassFlags(p.params) as typeof p.params;

    const capabilityPolicy = resolveNodeCommandCapabilityPolicy(command);
    const rateLimitKey = resolveRateLimitKey(command, p.params, client);
    const dangerousSessionKey = capabilityPolicy.dangerous
      ? resolveDangerousSessionKey(p.params)
      : null;
    const dangerousSessionKeyHash = hashSessionKeyForLedger(dangerousSessionKey);
    const dangerousLedgerBaseDir = capabilityPolicy.dangerous
      ? resolveDangerousLedgerBaseDir(context)
      : null;
    let dangerousPayloadHash: string | null = null;
    let dangerousDedupeKey: string | null = null;

    const writeDangerousLedger = (
      event: string,
      payload: Record<string, unknown>,
      enrichment?: {
        decision?: "allowed" | "denied";
        result?: "success" | "failure" | "pending";
        tokenHash?: string | null;
      },
    ) => {
      if (!capabilityPolicy.dangerous || !dangerousLedgerBaseDir) {
        return;
      }
      void appendDangerousLedgerEntry({
        baseDir: dangerousLedgerBaseDir,
        event,
        payload: {
          nodeId,
          command,
          idempotencyKey: p.idempotencyKey,
          sessionKeyHash: dangerousSessionKeyHash,
          payloadHash: dangerousPayloadHash,
          ...payload,
        },
        capability: capabilityPolicy.capability,
        subject: nodeId,
        sessionKeyHash: dangerousSessionKeyHash,
        decision: enrichment?.decision,
        result: enrichment?.result,
        tokenHash: enrichment?.tokenHash,
      }).catch((err) => {
        context.logGateway.warn(`dangerous ledger append failed: ${String(err)}`);
      });
    };

    const respondDangerous = (
      ok: boolean,
      payload?: unknown,
      error?: { code?: string; message?: string },
    ) => {
      if (capabilityPolicy.dangerous && dangerousDedupeKey && dangerousPayloadHash) {
        context.dedupe.set(dangerousDedupeKey, {
          ts: Date.now(),
          ok,
          payload,
          error: error as never,
          payloadHash: dangerousPayloadHash,
        });
      }
      respond(ok, payload, error as never);
    };

    if (capabilityPolicy.dangerous) {
      try {
        dangerousPayloadHash = resolveDangerousPayloadHash(nodeId, command, p.params);
      } catch (err) {
        dangerousActionLimiter.noteDenial(rateLimitKey);
        writeDangerousLedger("dangerous.invoke.denied", {
          reason: "payload hash failed",
          error: String(err),
        });
        respondDangerous(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "unable to hash dangerous payload"),
        );
        return;
      }
      dangerousDedupeKey = `node-danger:${rateLimitKey}:${p.idempotencyKey}`;
      const cached = context.dedupe.get(dangerousDedupeKey);
      if (cached) {
        if (cached.payloadHash && cached.payloadHash !== dangerousPayloadHash) {
          dangerousActionLimiter.noteDenial(rateLimitKey);
          writeDangerousLedger("dangerous.invoke.denied", {
            reason: "idempotency key reused with different payload",
          });
          respondDangerous(
            false,
            undefined,
            errorShape(
              ErrorCodes.INVALID_REQUEST,
              "idempotency key reused with different payload for dangerous command",
            ),
          );
          return;
        }
        if (cached.ok) {
          dangerousActionLimiter.noteSuccess(rateLimitKey);
        }
        respond(cached.ok, cached.payload, cached.error);
        return;
      }
    }

    if (capabilityPolicy.dangerous) {
      const limiterResult = dangerousActionLimiter.checkAndConsume(rateLimitKey);
      if (!limiterResult.ok) {
        writeDangerousLedger(
          "dangerous.invoke.denied",
          { reason: limiterResult.reason },
          { decision: "denied" },
        );
        respondDangerous(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, limiterResult.reason),
        );
        return;
      }
    }
    if (capabilityPolicy.requiresAdmin && !hasAdminScope(client)) {
      if (capabilityPolicy.dangerous) {
        dangerousActionLimiter.noteDenial(rateLimitKey);
        writeDangerousLedger(
          "dangerous.invoke.denied",
          { reason: "missing admin scope" },
          { decision: "denied" },
        );
      }
      respondDangerous(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.admin"),
      );
      return;
    }
    if (capabilityPolicy.breakGlassEnv) {
      const enabled = isBreakGlassEnvEnabled(process.env, capabilityPolicy.breakGlassEnv);
      if (!enabled) {
        if (capabilityPolicy.dangerous) {
          dangerousActionLimiter.noteDenial(rateLimitKey);
          writeDangerousLedger("dangerous.invoke.denied", {
            reason: `missing break-glass env ${capabilityPolicy.breakGlassEnv}`,
          });
        }
        respondDangerous(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            breakGlassMessage(command, capabilityPolicy.breakGlassEnv),
          ),
        );
        return;
      }
    }
    if (capabilityPolicy.requiresSessionKey && !resolveDangerousSessionKey(p.params)) {
      if (capabilityPolicy.dangerous) {
        dangerousActionLimiter.noteDenial(rateLimitKey);
        writeDangerousLedger(
          "dangerous.invoke.denied",
          { reason: "missing sessionKey" },
          { decision: "denied" },
        );
      }
      respondDangerous(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `${command} requires sessionKey for dangerous command approval binding`,
        ),
      );
      return;
    }
    // ── Runtime safe-exposure enforcement ──
    if (capabilityPolicy.requiresSafeExposure) {
      const cfg = loadConfig();
      const runtimeBindHost = await resolveGatewayBindHost(
        cfg.gateway?.bind,
        cfg.gateway?.customBindHost,
      );
      const tailscaleMode = String(cfg.gateway?.tailscale?.mode ?? "");
      if (!isSafeExposure(runtimeBindHost, tailscaleMode)) {
        const overrideEnv = "OPENCLAW_ALLOW_DANGEROUS_EXPOSED";
        if (!isBreakGlassEnvEnabled(process.env, overrideEnv)) {
          if (capabilityPolicy.dangerous) {
            dangerousActionLimiter.noteDenial(rateLimitKey);
            writeDangerousLedger("dangerous.invoke.denied", {
              reason: `${command} requires safe exposure (loopback or tailscale serve); set ${overrideEnv}=1 to override`,
            });
          }
          respondDangerous(
            false,
            undefined,
            errorShape(
              ErrorCodes.INVALID_REQUEST,
              `${command} blocked: gateway is exposed and ${overrideEnv}=1 is not set`,
            ),
          );
          return;
        }
      }
    }
    if (capabilityPolicy.requiresApprovalToken) {
      if (!dangerousPayloadHash) {
        dangerousActionLimiter.noteDenial(rateLimitKey);
        writeDangerousLedger("dangerous.invoke.denied", {
          reason: "missing dangerous payload hash for capability approval",
        });
        respondDangerous(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `${command} requires capability approval token binding`,
          ),
        );
        return;
      }
      const token = resolveCapabilityApprovalToken(p.params);
      if (!token) {
        dangerousActionLimiter.noteDenial(rateLimitKey);
        writeDangerousLedger("dangerous.invoke.denied", {
          reason: "missing capability approval token",
        });
        respondDangerous(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `${command} requires capability approval token`),
        );
        return;
      }
      // ── Approval request rate limit ──
      const approvalRateResult = dangerousActionLimiter.checkApprovalRequest(rateLimitKey);
      if (!approvalRateResult.ok) {
        writeDangerousLedger("dangerous.invoke.denied", {
          reason: approvalRateResult.reason,
        });
        respondDangerous(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, approvalRateResult.reason),
        );
        return;
      }
      const bindHash = computeCapabilityApprovalBindHash({
        capability: capabilityPolicy.capability,
        subject: nodeId,
        payloadHash: dangerousPayloadHash,
        agentId: resolveAgentIdFromParams(p.params),
        sessionKey: resolveDangerousSessionKey(p.params),
      });
      const valid = context.execApprovalManager.consumeToken(token, bindHash);
      if (!valid) {
        dangerousActionLimiter.noteDenial(rateLimitKey);
        writeDangerousLedger("dangerous.invoke.denied", {
          reason: "invalid capability approval token",
        });
        respondDangerous(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `${command} approval token invalid or expired`),
        );
        return;
      }
    }
    if (command === "system.run") {
      const { rawCommand, argv } = resolveSystemRunInputs(p.params);
      const constrained = validateSystemRunCommand({
        command: rawCommand,
        argv,
      });
      if (!constrained.ok) {
        if (capabilityPolicy.dangerous) {
          dangerousActionLimiter.noteDenial(rateLimitKey);
          writeDangerousLedger(
            "dangerous.invoke.denied",
            { reason: constrained.reason },
            { decision: "denied" },
          );
        }
        respondDangerous(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, constrained.reason),
        );
        return;
      }
      // ── Deny-by-default env inheritance ──
      const rawParams = p.params as Record<string, unknown> | undefined;
      if (rawParams?.env && typeof rawParams.env === "object") {
        const envResult = sanitizeExecEnv(rawParams.env as Record<string, string>, {
          allowArbitraryEnv: isArbitraryEnvAllowed(process.env),
        });
        if (!envResult.ok) {
          if (capabilityPolicy.dangerous) {
            dangerousActionLimiter.noteDenial(rateLimitKey);
            writeDangerousLedger(
              "dangerous.invoke.denied",
              { reason: envResult.reason },
              { decision: "denied" },
            );
          }
          respondDangerous(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, envResult.reason),
          );
          return;
        }
        (p.params as Record<string, unknown>).env = envResult.env;
      }
      // ── CWD containment ──
      const cwdParam = (p.params as Record<string, unknown> | undefined)?.cwd;
      const cwdStr = typeof cwdParam === "string" ? cwdParam : undefined;
      const cfgForCwd = loadConfig();
      const nodesConfig = cfgForCwd.gateway?.nodes as Record<string, unknown> | undefined;
      const workspaceRoot = resolveWorkspaceRoot(
        (nodesConfig?.workspaceRoot as string) ?? undefined,
      );
      if (workspaceRoot) {
        const cwdResult = await validateExecCwd(cwdStr, workspaceRoot);
        if (!cwdResult.ok) {
          if (capabilityPolicy.dangerous) {
            dangerousActionLimiter.noteDenial(rateLimitKey);
            writeDangerousLedger(
              "dangerous.invoke.denied",
              { reason: cwdResult.reason },
              { decision: "denied" },
            );
          }
          respondDangerous(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, cwdResult.reason),
          );
          return;
        }
        (p.params as Record<string, unknown>).cwd = cwdResult.resolvedCwd;
      }
    }

    // ── Concurrency cap for dangerous operations ──
    if (capabilityPolicy.dangerous) {
      const concurrencyResult = dangerousActionLimiter.acquireConcurrency(rateLimitKey);
      if (!concurrencyResult.ok) {
        writeDangerousLedger("dangerous.invoke.denied", { reason: concurrencyResult.reason });
        respondDangerous(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, concurrencyResult.reason),
        );
        return;
      }
    }

    // ── GL-4 Lockdown: Runtime Invariants & Resource Governor ──
    if (capabilityPolicy.dangerous) {
      try {
        await assertDangerousCapabilityInvariants(capabilityPolicy.capability, p.params, {
          bindHost: await resolveGatewayBindHost(
            loadConfig().gateway?.bind,
            loadConfig().gateway?.customBindHost,
          ),
          tailscaleMode: loadConfig().gateway?.tailscale?.mode ?? "",
          env: process.env,
        });
      } catch (err) {
        // Release the legacy limiter since we are aborting
        dangerousActionLimiter.releaseConcurrency(rateLimitKey);

        const msg = err instanceof Error ? err.message : String(err);
        writeDangerousLedger("dangerous.invoke.denied", {
          reason: "invariant violation",
          details: msg,
        });
        respondDangerous(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Lockdown Violation: ${msg}`),
        );
        return;
      }

      // Acquire global dangerous slot (throws if full)
      try {
        acquireDangerousSlot();
      } catch (err) {
        dangerousActionLimiter.releaseConcurrency(rateLimitKey);
        const msg = err instanceof Error ? err.message : String(err);
        writeDangerousLedger("dangerous.invoke.denied", {
          reason: "resource exhaustion",
          details: msg,
        });
        respondDangerous(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, msg));
        return;
      }
    }

    try {
      await respondUnavailableOnThrow(respond, async () => {
        const cfg = loadConfig();
        const sanitizedParams = sanitizeCapabilityApprovalTokenParams(p.params);

        // ── Exec budget resolution ──
        const dangerousCommands = cfg.gateway?.nodes?.allowCommands ?? [];
        const execBudget = resolveExecBudget(command, dangerousCommands);
        const clampedTimeoutMs = clampTimeoutMs(p.timeoutMs, execBudget);

        // Inject budget metadata into params for downstream enforcement
        if (sanitizedParams && typeof sanitizedParams === "object") {
          (sanitizedParams as Record<string, unknown>).__execBudget = {
            timeoutMs: clampedTimeoutMs,
            maxStdoutBytes: execBudget.maxStdoutBytes,
            maxStderrBytes: execBudget.maxStderrBytes,
            maxOutputBytes: execBudget.maxTotalOutputBytes,
          };
          if (isArbitraryEnvAllowed(process.env)) {
            (sanitizedParams as Record<string, unknown>).allowArbitraryEnv = true;
          }
        }

        const invokeResult = await invokeNodeCommandWithKernelGate({
          cfg,
          nodeRegistry: context.nodeRegistry,
          nodeId,
          command,
          commandParams: sanitizedParams,
          timeoutMs: clampedTimeoutMs,
          idempotencyKey: p.idempotencyKey,
        });
        if (!invokeResult.ok) {
          if (capabilityPolicy.dangerous) {
            dangerousActionLimiter.noteDenial(rateLimitKey);
            writeDangerousLedger("dangerous.invoke.denied", {
              reason: invokeResult.message,
              gateCode: invokeResult.code,
            });
          }
          const code =
            invokeResult.code === "NOT_ALLOWED"
              ? ErrorCodes.INVALID_REQUEST
              : ErrorCodes.UNAVAILABLE;
          respondDangerous(
            false,
            undefined,
            errorShape(code, invokeResult.message, {
              details: invokeResult.details,
            }),
          );
          return;
        }
        const res = invokeResult.result;
        if (!res.ok) {
          if (capabilityPolicy.dangerous) {
            dangerousActionLimiter.noteDenial(rateLimitKey);
            writeDangerousLedger("dangerous.invoke.denied", {
              reason: res.error?.message ?? "node invoke failed",
              nodeErrorCode: res.error?.code,
            });
          }
          respondDangerous(
            false,
            undefined,
            errorShape(ErrorCodes.UNAVAILABLE, res.error?.message ?? "node invoke failed", {
              details: { nodeError: res.error ?? null },
            }),
          );
          return;
        }
        const payload = res.payloadJSON ? safeParseJson(res.payloadJSON) : res.payload;

        // ── Output boundary cap ──
        const MAX_GATEWAY_OUTPUT_BYTES = 3 * 1024 * 1024; // 3 MB hard cap
        let finalPayloadJSON = res.payloadJSON ?? null;
        let outputTruncated = false;
        if (typeof finalPayloadJSON === "string") {
          const outputBytes = Buffer.byteLength(finalPayloadJSON, "utf8");
          if (outputBytes > MAX_GATEWAY_OUTPUT_BYTES) {
            finalPayloadJSON =
              finalPayloadJSON.slice(0, MAX_GATEWAY_OUTPUT_BYTES) + "\n[truncated]";
            outputTruncated = true;
            if (capabilityPolicy.dangerous) {
              writeDangerousLedger("dangerous.invoke.output_truncated", {
                originalBytes: outputBytes,
                maxBytes: MAX_GATEWAY_OUTPUT_BYTES,
              });
            }
          }
        }

        if (capabilityPolicy.dangerous) {
          dangerousActionLimiter.noteSuccess(rateLimitKey);
          writeDangerousLedger(
            "dangerous.invoke.allowed",
            { ok: true, outputTruncated },
            { decision: "allowed", result: "success" },
          );
        }
        respondDangerous(
          true,
          {
            ok: true,
            nodeId,
            command,
            payload: outputTruncated ? safeParseJson(finalPayloadJSON ?? "") : payload,
            payloadJSON: finalPayloadJSON,
          },
          undefined,
        );
      });
    } finally {
      if (capabilityPolicy.dangerous) {
        releaseDangerousSlot();
        dangerousActionLimiter.releaseConcurrency(rateLimitKey);
      }
    }
  },
  "node.invoke.result": async ({ params, respond, context, client }) => {
    const normalizedParams = normalizeNodeInvokeResultParams(params);
    if (!validateNodeInvokeResultParams(normalizedParams)) {
      respondInvalidParams({
        respond,
        method: "node.invoke.result",
        validator: validateNodeInvokeResultParams,
      });
      return;
    }
    const p = normalizedParams as {
      id: string;
      nodeId: string;
      ok: boolean;
      payload?: unknown;
      payloadJSON?: string | null;
      error?: { code?: string; message?: string } | null;
    };
    const callerNodeId = client?.connect?.device?.id ?? client?.connect?.client?.id;
    if (callerNodeId && callerNodeId !== p.nodeId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "nodeId mismatch"));
      return;
    }
    const ok = context.nodeRegistry.handleInvokeResult({
      id: p.id,
      nodeId: p.nodeId,
      ok: p.ok,
      payload: p.payload,
      payloadJSON: p.payloadJSON ?? null,
      error: p.error ?? null,
    });
    if (!ok) {
      // Late-arriving results (after invoke timeout) are expected and harmless.
      // Return success instead of error to reduce log noise; client can discard.
      context.logGateway.debug(`late invoke result ignored: id=${p.id} node=${p.nodeId}`);
      respond(true, { ok: true, ignored: true }, undefined);
      return;
    }
    respond(true, { ok: true }, undefined);
  },
  "node.event": async ({ params, respond, context, client }) => {
    if (!validateNodeEventParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.event",
        validator: validateNodeEventParams,
      });
      return;
    }
    const p = params as { event: string; payload?: unknown; payloadJSON?: string | null };
    const payloadJSON =
      typeof p.payloadJSON === "string"
        ? p.payloadJSON
        : p.payload !== undefined
          ? JSON.stringify(p.payload)
          : null;
    await respondUnavailableOnThrow(respond, async () => {
      const { handleNodeEvent } = await import("../server-node-events.js");
      const nodeId = client?.connect?.device?.id ?? client?.connect?.client?.id ?? "node";
      const nodeContext = {
        deps: context.deps,
        broadcast: context.broadcast,
        nodeSendToSession: context.nodeSendToSession,
        nodeSubscribe: context.nodeSubscribe,
        nodeUnsubscribe: context.nodeUnsubscribe,
        broadcastVoiceWakeChanged: context.broadcastVoiceWakeChanged,
        addChatRun: context.addChatRun,
        removeChatRun: context.removeChatRun,
        chatAbortControllers: context.chatAbortControllers,
        chatAbortedRuns: context.chatAbortedRuns,
        chatRunBuffers: context.chatRunBuffers,
        chatDeltaSentAt: context.chatDeltaSentAt,
        dedupe: context.dedupe,
        agentRunSeq: context.agentRunSeq,
        getHealthCache: context.getHealthCache,
        refreshHealthSnapshot: context.refreshHealthSnapshot,
        loadGatewayModelCatalog: context.loadGatewayModelCatalog,
        logGateway: { warn: context.logGateway.warn },
      };
      await handleNodeEvent(nodeContext, nodeId, {
        event: p.event,
        payloadJSON,
      });
      respond(true, { ok: true }, undefined);
    });
  },
};
