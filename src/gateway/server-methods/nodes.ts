import type { ExecApprovalRequestPayload } from "../exec-approval-manager.js";
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
import { validateSystemRunCommand } from "../../security/system-run-constraints.js";
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

function policyMutationEnabled() {
  const value = process.env.OPENCLAW_ALLOW_POLICY_MUTATION?.trim().toLowerCase();
  return value === "1" || value === "true";
}

function browserProxyEnabled() {
  const value = process.env.OPENCLAW_ALLOW_BROWSER_PROXY?.trim().toLowerCase();
  return value === "1" || value === "true";
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

function sanitizeSystemRunApprovalParams(
  params: unknown,
  context: Parameters<GatewayRequestHandlers["node.invoke"]>[0]["context"],
): unknown {
  if (!params || typeof params !== "object") {
    return params;
  }
  const candidate = { ...(params as Record<string, unknown>) };
  const bypassRequested =
    candidate.approved === true ||
    candidate.approvalDecision === "allow-once" ||
    candidate.approvalDecision === "allow-always";
  if (!bypassRequested) {
    return candidate;
  }

  const token =
    typeof candidate.approvalToken === "string" && candidate.approvalToken.trim().length > 0
      ? candidate.approvalToken.trim()
      : "";
  const rawCommand =
    typeof candidate.rawCommand === "string" && candidate.rawCommand.trim().length > 0
      ? candidate.rawCommand
      : Array.isArray(candidate.command)
        ? candidate.command.map((entry) => String(entry)).join(" ")
        : typeof candidate.command === "string"
          ? candidate.command
          : "";
  const bindRequest: ExecApprovalRequestPayload = {
    command: rawCommand,
    commandArgv: Array.isArray(candidate.command)
      ? candidate.command.map((entry) => String(entry))
      : null,
    commandEnv: normalizeCommandEnv(candidate.env),
    cwd: typeof candidate.cwd === "string" ? candidate.cwd : null,
    host: "node",
    security: typeof candidate.security === "string" ? candidate.security : null,
    ask: typeof candidate.ask === "string" ? candidate.ask : null,
    agentId: typeof candidate.agentId === "string" ? candidate.agentId : null,
    resolvedPath: typeof candidate.resolvedPath === "string" ? candidate.resolvedPath : null,
    sessionKey: typeof candidate.sessionKey === "string" ? candidate.sessionKey : null,
  };
  const expectedHash = context.execApprovalManager.computeBindHash(bindRequest);
  const valid = token ? context.execApprovalManager.consumeToken(token, expectedHash) : false;
  if (!valid) {
    delete candidate.approved;
    delete candidate.approvalDecision;
    delete candidate.approvalToken;
  }
  return candidate;
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
    if (
      (command === "system.execApprovals.get" || command === "system.execApprovals.set") &&
      !hasAdminScope(client)
    ) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.admin"),
      );
      return;
    }
    if (command === "browser.proxy" && !hasAdminScope(client)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.admin"),
      );
      return;
    }
    if (command === "browser.proxy" && !browserProxyEnabled()) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "browser.proxy is disabled; set OPENCLAW_ALLOW_BROWSER_PROXY=1",
        ),
      );
      return;
    }
    if (command === "system.execApprovals.set" && !policyMutationEnabled()) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "policy mutation is disabled; set OPENCLAW_ALLOW_POLICY_MUTATION=1",
        ),
      );
      return;
    }
    if (command === "system.run") {
      const { rawCommand, argv } = resolveSystemRunInputs(p.params);
      const constrained = validateSystemRunCommand({
        command: rawCommand,
        argv,
      });
      if (!constrained.ok) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, constrained.reason));
        return;
      }
    }

    await respondUnavailableOnThrow(respond, async () => {
      const cfg = loadConfig();
      const sanitizedParams =
        command === "system.run" ? sanitizeSystemRunApprovalParams(p.params, context) : p.params;
      const invokeResult = await invokeNodeCommandWithKernelGate({
        cfg,
        nodeRegistry: context.nodeRegistry,
        nodeId,
        command,
        commandParams: sanitizedParams,
        timeoutMs: p.timeoutMs,
        idempotencyKey: p.idempotencyKey,
      });
      if (!invokeResult.ok) {
        const code =
          invokeResult.code === "NOT_ALLOWED" ? ErrorCodes.INVALID_REQUEST : ErrorCodes.UNAVAILABLE;
        respond(
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
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, res.error?.message ?? "node invoke failed", {
            details: { nodeError: res.error ?? null },
          }),
        );
        return;
      }
      const payload = res.payloadJSON ? safeParseJson(res.payloadJSON) : res.payload;
      respond(
        true,
        {
          ok: true,
          nodeId,
          command,
          payload,
          payloadJSON: res.payloadJSON ?? null,
        },
        undefined,
      );
    });
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
