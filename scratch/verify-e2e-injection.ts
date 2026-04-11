import { EventEmitter } from "node:events";
import { CONTROL_UI_OPERATOR_AGENTS_KEY } from "../src/gateway/control-ui-shared.js";
import { handleControlUiHttpRequest } from "../src/gateway/control-ui.js";

class MockRequest extends EventEmitter {
  url = "/ui/";
  method = "GET";
  headers = {};
}

class MockResponse extends EventEmitter {
  statusCode = 200;
  headers = {};
  body = "";
  setHeader(name, value) {
    this.headers[name] = value;
  }
  end(chunk) {
    if (chunk) {
      this.body += chunk;
    }
    this.emit("finish");
  }
}

async function verify() {
  const req = new MockRequest();
  const res = new MockResponse();

  // Mocking config and agent discovery
  const opts = {
    basePath: "/ui",
    root: { kind: "resolved", path: "./dist/control-ui" },
    config: {
      agents: {
        list: [
          { id: "triage", name: "Triage" },
          { id: "coder", name: "Coder" },
          { id: "admin", name: "Admin" },
        ],
      },
    },
  };

  console.log("Starting handler...");
  const handled = handleControlUiHttpRequest(req, res, opts);
  console.log("Handler returned:", handled);

  return new Promise((resolve) => {
    res.on("finish", () => {
      console.log("Response Body (excerpt):");
      console.log(res.body.slice(0, 500));
      if (res.body.includes(CONTROL_UI_OPERATOR_AGENTS_KEY)) {
        console.log("\n✅ Injection SUCCESS: Operator agents found in served HTML.");
        resolve(true);
      } else {
        console.log("\n❌ Injection FAILED: Operator agents missing in served HTML.");
        process.exit(1);
      }
    });
  });
}

verify().catch((err) => {
  console.error(err);
  process.exit(1);
});
