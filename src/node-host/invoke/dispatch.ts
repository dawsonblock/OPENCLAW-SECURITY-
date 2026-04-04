import type { GatewayClient } from "../../gateway/client.js";
import { sendInvokeResult } from "../events.js";
import type { SkillBinsCache } from "../skill-bins-cache.js";
import type { NodeInvokeRequestPayload } from "../types.js";
import { handleBrowserProxy } from "./browser-proxy.js";
import {
  handleSystemExecApprovalsGet,
  handleSystemExecApprovalsSet,
} from "./system-exec-approvals.js";
import { handleSystemRun } from "./system-run.js";
import { handleSystemWhich } from "./system-which.js";

export async function handleInvoke(
  frame: NodeInvokeRequestPayload,
  client: GatewayClient,
  skillBins: SkillBinsCache,
) {
  const command = String(frame.command ?? "");
  switch (command) {
    case "system.execApprovals.get":
      await handleSystemExecApprovalsGet(client, frame);
      return;
    case "system.execApprovals.set":
      await handleSystemExecApprovalsSet(client, frame);
      return;
    case "system.which":
      await handleSystemWhich(client, frame);
      return;
    case "browser.proxy":
      await handleBrowserProxy(client, frame);
      return;
    case "system.run":
      await handleSystemRun(client, frame, skillBins);
      return;
    default:
      await sendInvokeResult(client, frame, {
        ok: false,
        error: { code: "UNAVAILABLE", message: "command not supported" },
      });
  }
}
