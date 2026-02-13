import type { ExecApprovalForwarder } from "../../infra/exec-approval-forwarder.js";
import type { ExecApprovalDecision } from "../../infra/exec-approvals.js";
import type { ExecApprovalManager } from "../exec-approval-manager.js";
import type { GatewayRequestHandlers } from "./types.js";
import { computeCapabilityApprovalBindHash } from "../../security/capability-approval.js";
import { validateSystemRunCommand } from "../../security/system-run-constraints.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateCapabilityApprovalRequestParams,
  validateExecApprovalRequestParams,
  validateExecApprovalResolveParams,
} from "../protocol/index.js";

function resolveApprovalSessionKey(params: {
  sessionKey?: string | null;
  agentId?: string | null;
}): string {
  if (typeof params.sessionKey === "string" && params.sessionKey.trim()) {
    return params.sessionKey.trim();
  }
  if (typeof params.agentId === "string" && params.agentId.trim()) {
    return `agent:${params.agentId.trim()}:main`;
  }
  return "";
}

export function createExecApprovalHandlers(
  manager: ExecApprovalManager,
  opts?: { forwarder?: ExecApprovalForwarder },
): GatewayRequestHandlers {
  const requestAndAwaitApproval = async (params: {
    explicitId: string | null;
    timeoutMs: number;
    request: Parameters<ExecApprovalManager["create"]>[0];
    bindHash: string;
    context: Parameters<GatewayRequestHandlers["exec.approval.request"]>[0]["context"];
    respond: Parameters<GatewayRequestHandlers["exec.approval.request"]>[0]["respond"];
  }) => {
    if (params.explicitId && manager.getSnapshot(params.explicitId)) {
      params.respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "approval id already pending"),
      );
      return;
    }
    const record = manager.create(params.request, params.timeoutMs, params.explicitId);
    const decisionPromise = manager.waitForDecision(record, params.timeoutMs);
    params.context.broadcast(
      "exec.approval.requested",
      {
        id: record.id,
        request: record.request,
        createdAtMs: record.createdAtMs,
        expiresAtMs: record.expiresAtMs,
      },
      { dropIfSlow: true },
    );
    void opts?.forwarder
      ?.handleRequested({
        id: record.id,
        request: record.request,
        createdAtMs: record.createdAtMs,
        expiresAtMs: record.expiresAtMs,
      })
      .catch((err) => {
        params.context.logGateway?.error?.(
          `exec approvals: forward request failed: ${String(err)}`,
        );
      });
    const decision = await decisionPromise;
    const approvalToken =
      decision === "allow-once" || decision === "allow-always"
        ? manager.issueToken(params.bindHash)
        : null;
    params.respond(
      true,
      {
        id: record.id,
        decision,
        approvalToken,
        createdAtMs: record.createdAtMs,
        expiresAtMs: record.expiresAtMs,
      },
      undefined,
    );
  };

  return {
    "exec.approval.request": async ({ params, respond, context }) => {
      if (!validateExecApprovalRequestParams(params)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid exec.approval.request params: ${formatValidationErrors(
              validateExecApprovalRequestParams.errors,
            )}`,
          ),
        );
        return;
      }
      const p = params as {
        id?: string;
        command: string;
        commandArgv?: string[] | null;
        commandEnv?: Record<string, string> | null;
        cwd?: string;
        host?: string;
        security?: string;
        ask?: string;
        agentId?: string;
        resolvedPath?: string;
        sessionKey?: string;
        timeoutMs?: number;
      };
      const sessionKey = resolveApprovalSessionKey({
        sessionKey: p.sessionKey,
        agentId: p.agentId,
      });
      if (!sessionKey) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "sessionKey required for exec approvals"),
        );
        return;
      }
      const commandConstraint = validateSystemRunCommand({
        command: p.command,
        argv: Array.isArray(p.commandArgv) ? p.commandArgv : null,
      });
      if (!commandConstraint.ok) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, commandConstraint.reason));
        return;
      }
      const timeoutMs = typeof p.timeoutMs === "number" ? p.timeoutMs : 120_000;
      const explicitId = typeof p.id === "string" && p.id.trim().length > 0 ? p.id.trim() : null;
      const request = {
        command: p.command,
        commandArgv: Array.isArray(p.commandArgv)
          ? p.commandArgv.map((token) => String(token))
          : null,
        commandEnv: p.commandEnv && typeof p.commandEnv === "object" ? p.commandEnv : null,
        cwd: p.cwd ?? null,
        host: p.host ?? null,
        security: p.security ?? null,
        ask: p.ask ?? null,
        agentId: p.agentId ?? null,
        resolvedPath: p.resolvedPath ?? null,
        sessionKey,
      };
      await requestAndAwaitApproval({
        explicitId,
        timeoutMs,
        request,
        bindHash: manager.computeBindHash(request),
        context,
        respond,
      });
    },
    "capability.approval.request": async ({ params, respond, context }) => {
      if (!validateCapabilityApprovalRequestParams(params)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid capability.approval.request params: ${formatValidationErrors(
              validateCapabilityApprovalRequestParams.errors,
            )}`,
          ),
        );
        return;
      }
      const p = params as {
        id?: string;
        capability: string;
        subject: string;
        payloadHash: string;
        agentId?: string | null;
        sessionKey?: string | null;
        timeoutMs?: number;
      };
      const sessionKey = resolveApprovalSessionKey({
        sessionKey: p.sessionKey ?? null,
        agentId: p.agentId ?? null,
      });
      if (!sessionKey) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "sessionKey required for capability approvals"),
        );
        return;
      }
      const timeoutMs = typeof p.timeoutMs === "number" ? p.timeoutMs : 120_000;
      const explicitId = typeof p.id === "string" && p.id.trim().length > 0 ? p.id.trim() : null;
      const request = {
        command: `capability:${p.capability}`,
        commandArgv: [p.subject],
        commandEnv: null,
        cwd: `subject:${p.subject}`,
        host: "capability",
        security: null,
        ask: null,
        agentId: p.agentId ?? null,
        resolvedPath: p.payloadHash,
        sessionKey,
      };
      await requestAndAwaitApproval({
        explicitId,
        timeoutMs,
        request,
        bindHash: computeCapabilityApprovalBindHash({
          capability: p.capability,
          subject: p.subject,
          payloadHash: p.payloadHash,
          agentId: p.agentId ?? null,
          sessionKey,
        }),
        context,
        respond,
      });
    },
    "exec.approval.resolve": async ({ params, respond, client, context }) => {
      if (!validateExecApprovalResolveParams(params)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid exec.approval.resolve params: ${formatValidationErrors(
              validateExecApprovalResolveParams.errors,
            )}`,
          ),
        );
        return;
      }
      const p = params as { id: string; decision: string };
      const decision = p.decision as ExecApprovalDecision;
      if (decision !== "allow-once" && decision !== "allow-always" && decision !== "deny") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid decision"));
        return;
      }
      const resolvedBy = client?.connect?.client?.displayName ?? client?.connect?.client?.id;
      const ok = manager.resolve(p.id, decision, resolvedBy ?? null);
      if (!ok) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown approval id"));
        return;
      }
      context.broadcast(
        "exec.approval.resolved",
        { id: p.id, decision, resolvedBy, ts: Date.now() },
        { dropIfSlow: true },
      );
      void opts?.forwarder
        ?.handleResolved({ id: p.id, decision, resolvedBy, ts: Date.now() })
        .catch((err) => {
          context.logGateway?.error?.(`exec approvals: forward resolve failed: ${String(err)}`);
        });
      respond(true, { ok: true }, undefined);
    },
  };
}
