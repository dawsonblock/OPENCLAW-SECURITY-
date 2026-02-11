import { runAllowedCommand, spawnAllowed } from "../../../src/security/subprocess.js";
import { getTailscaleDnsName } from "./webhook.js";

/**
 * Tunnel configuration for exposing the webhook server.
 */
export interface TunnelConfig {
  /** Tunnel provider: ngrok, tailscale-serve, or tailscale-funnel */
  provider: "ngrok" | "tailscale-serve" | "tailscale-funnel" | "none";
  /** Local port to tunnel */
  port: number;
  /** Path prefix for the tunnel (e.g., /voice/webhook) */
  path: string;
  /** ngrok auth token (optional, enables longer sessions) */
  ngrokAuthToken?: string;
  /** ngrok custom domain (paid feature) */
  ngrokDomain?: string;
}

/**
 * Result of starting a tunnel.
 */
export interface TunnelResult {
  /** The public URL */
  publicUrl: string;
  /** Function to stop the tunnel */
  stop: () => Promise<void>;
  /** Tunnel provider name */
  provider: string;
}

/**
 * Start an ngrok tunnel to expose the local webhook server.
 *
 * Uses the ngrok CLI which must be installed: https://ngrok.com/download
 *
 * @example
 * const tunnel = await startNgrokTunnel({ port: 3334, path: '/voice/webhook' });
 * console.log('Public URL:', tunnel.publicUrl);
 * // Later: await tunnel.stop();
 */
export async function startNgrokTunnel(config: {
  port: number;
  path: string;
  authToken?: string;
  domain?: string;
}): Promise<TunnelResult> {
  // Set auth token if provided
  if (config.authToken) {
    await runNgrokCommand(["config", "add-authtoken", config.authToken]);
  }

  // Build ngrok command args
  const args = ["http", String(config.port), "--log", "stdout", "--log-format", "json"];

  // Add custom domain if provided (paid ngrok feature)
  if (config.domain) {
    args.push("--domain", config.domain);
  }

  return new Promise((resolve, reject) => {
    const proc = spawnAllowed({
      command: "ngrok",
      args,
      allowedBins: ["ngrok"],
      stdio: ["ignore", "pipe", "pipe"],
      envOverrides: {},
    });
    if (!proc.stdout || !proc.stderr) {
      reject(new Error("ngrok stdout/stderr pipes were not available"));
      return;
    }

    let resolved = false;
    let publicUrl: string | null = null;
    let outputBuffer = "";
    const maxOutputBufferBytes = 1_000_000;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill("SIGTERM");
        reject(new Error("ngrok startup timed out (30s)"));
      }
    }, 30000);

    const processLine = (line: string) => {
      try {
        const log = JSON.parse(line);

        // ngrok logs the public URL in a 'started tunnel' message
        if (log.msg === "started tunnel" && log.url) {
          publicUrl = log.url;
        }

        // Also check for the URL field directly
        if (log.addr && log.url && !publicUrl) {
          publicUrl = log.url;
        }

        // Check for ready state
        if (publicUrl && !resolved) {
          resolved = true;
          clearTimeout(timeout);

          // Add path to the public URL
          const fullUrl = publicUrl + config.path;

          console.log(`[voice-call] ngrok tunnel active: ${fullUrl}`);

          resolve({
            publicUrl: fullUrl,
            provider: "ngrok",
            stop: async () => {
              proc.kill("SIGTERM");
              await new Promise<void>((res) => {
                proc.on("close", () => res());
                setTimeout(res, 2000); // Fallback timeout
              });
            },
          });
        }
      } catch {
        // Not JSON, might be startup message
      }
    };

    proc.stdout.on("data", (data: Buffer) => {
      outputBuffer += data.toString();
      if (Buffer.byteLength(outputBuffer, "utf8") > maxOutputBufferBytes) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          proc.kill("SIGTERM");
          reject(new Error("ngrok startup output exceeded limits"));
        }
        return;
      }
      const lines = outputBuffer.split("\n");
      outputBuffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          processLine(line);
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      const msg = data.toString();
      // Check for common errors
      if (msg.includes("ERR_NGROK")) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`ngrok error: ${msg}`));
        }
      }
    });

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to start ngrok: ${err.message}`));
      }
    });

    proc.on("close", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`ngrok exited unexpectedly with code ${code}`));
      }
    });
  });
}

/**
 * Run an ngrok command and wait for completion.
 */
async function runNgrokCommand(args: string[]): Promise<string> {
  const { code, stdout, stderr } = await runAllowedCommand({
    command: "ngrok",
    args,
    allowedBins: ["ngrok"],
    timeoutMs: 15_000,
    maxStdoutBytes: 500_000,
    maxStderrBytes: 500_000,
  });
  if (code === 0) {
    return stdout;
  }
  throw new Error(`ngrok command failed: ${stderr || stdout}`);
}

/**
 * Check if ngrok is installed and available.
 */
export async function isNgrokAvailable(): Promise<boolean> {
  try {
    const { code } = await runAllowedCommand({
      command: "ngrok",
      args: ["version"],
      allowedBins: ["ngrok"],
      timeoutMs: 5_000,
      maxStdoutBytes: 100_000,
      maxStderrBytes: 100_000,
    });
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Start a Tailscale serve/funnel tunnel.
 */
export async function startTailscaleTunnel(config: {
  mode: "serve" | "funnel";
  port: number;
  path: string;
}): Promise<TunnelResult> {
  // Get Tailscale DNS name
  const dnsName = await getTailscaleDnsName();
  if (!dnsName) {
    throw new Error("Could not get Tailscale DNS name. Is Tailscale running?");
  }

  const path = config.path.startsWith("/") ? config.path : `/${config.path}`;
  const localUrl = `http://127.0.0.1:${config.port}${path}`;

  return new Promise((resolve, reject) => {
    const proc = spawnAllowed({
      command: "tailscale",
      args: [config.mode, "--bg", "--yes", "--set-path", path, localUrl],
      allowedBins: ["tailscale"],
      stdio: ["ignore", "pipe", "pipe"],
      envOverrides: {},
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`Tailscale ${config.mode} timed out`));
    }, 10000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        const publicUrl = `https://${dnsName}${path}`;
        console.log(`[voice-call] Tailscale ${config.mode} active: ${publicUrl}`);

        resolve({
          publicUrl,
          provider: `tailscale-${config.mode}`,
          stop: async () => {
            await stopTailscaleTunnel(config.mode, path);
          },
        });
      } else {
        reject(new Error(`Tailscale ${config.mode} failed with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Stop a Tailscale serve/funnel tunnel.
 */
async function stopTailscaleTunnel(mode: "serve" | "funnel", path: string): Promise<void> {
  try {
    await runAllowedCommand({
      command: "tailscale",
      args: [mode, "off", path],
      allowedBins: ["tailscale"],
      timeoutMs: 5_000,
      maxStdoutBytes: 100_000,
      maxStderrBytes: 100_000,
    });
  } catch {
    // best effort stop
  }
}

/**
 * Start a tunnel based on configuration.
 */
export async function startTunnel(config: TunnelConfig): Promise<TunnelResult | null> {
  switch (config.provider) {
    case "ngrok":
      return startNgrokTunnel({
        port: config.port,
        path: config.path,
        authToken: config.ngrokAuthToken,
        domain: config.ngrokDomain,
      });

    case "tailscale-serve":
      return startTailscaleTunnel({
        mode: "serve",
        port: config.port,
        path: config.path,
      });

    case "tailscale-funnel":
      return startTailscaleTunnel({
        mode: "funnel",
        port: config.port,
        path: config.path,
      });

    default:
      return null;
  }
}
