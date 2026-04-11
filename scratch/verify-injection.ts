import { CONTROL_UI_OPERATOR_AGENTS_KEY } from "../src/gateway/control-ui-shared.ts";
import { injectControlUiConfig } from "../src/gateway/control-ui.ts";

const mockHtml = `<html><head><title>Test</title></head><body></body></html>`;
const opts = {
  basePath: "/ui",
  assistantName: "Claude",
  assistantAvatar: "avatar.png",
  operatorAgentIds: ["triage", "coder", "admin"],
};

const injected = injectControlUiConfig(mockHtml, opts);
console.log("Injected HTML:");
console.log(injected);

if (injected.includes(`window.${CONTROL_UI_OPERATOR_AGENTS_KEY}=["triage","coder","admin"]`)) {
  console.log("\n✅ Injection SUCCESS: Operator agents found in window config.");
} else {
  console.log("\n❌ Injection FAILED: Operator agents missing or incorrect.");
  process.exit(1);
}
