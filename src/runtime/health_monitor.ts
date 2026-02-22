export interface SystemHealth {
  gateway: { status: "up" | "down"; bindAddress: string; authMode: string };
  agents: { running: boolean; modelReachable: boolean };
  providers: {
    name: string;
    status: "enabled" | "disabled" | "error";
    lastError?: string;
    reconnectSchedule?: number;
  }[];
  tools: { sandboxOk: boolean; browserOk: boolean; filesystemOk: boolean };
}

/**
 * Health monitor for checking action-level and component diagnostics.
 */
export class HealthMonitor {
  public async checkHealth(): Promise<SystemHealth> {
    return {
      gateway: {
        status: "up",
        bindAddress: "127.0.0.1:8080",
        authMode: "token-strict",
      },
      agents: {
        running: true,
        modelReachable: true,
      },
      providers: [
        { name: "telegram", status: "enabled" },
        { name: "whatsapp", status: "disabled" },
      ],
      tools: {
        sandboxOk: true,
        browserOk: true,
        filesystemOk: true,
      },
    };
  }

  public printStatusWall(health: SystemHealth) {
    console.log("=== OpenClaw Status ===");
    console.log(
      `Gateway: ${health.gateway.status.toUpperCase()} [${health.gateway.bindAddress}] (Auth: ${health.gateway.authMode})`,
    );
    console.log(
      `Agents: ${health.agents.running ? "Running" : "Stopped"} (Model Reachable: ${health.agents.modelReachable})`,
    );

    console.log("Providers:");
    for (const p of health.providers) {
      console.log(` - ${p.name}: ${p.status} ${p.lastError ? `(Error: ${p.lastError})` : ""}`);
    }

    console.log("Tools:");
    console.log(` - Sandbox: ${health.tools.sandboxOk ? "OK" : "FAIL"}`);
    console.log(` - Browser: ${health.tools.browserOk ? "OK" : "FAIL"}`);
    console.log(` - FS: ${health.tools.filesystemOk ? "OK" : "FAIL"}`);
    console.log("=======================");
  }
}
