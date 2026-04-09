# Integration Guide: Operational Maturity Features

This guide shows how to integrate the operational maturity components into your OpenCLAW gateway.

## 1. Security Event Emission in RFSN Gate

### Before: Gate without events
```typescript
// src/rfsn/dispatch.ts (old)
export async function rfsnDispatch(params: { tool; args; ... }): Promise<...> {
  const decision = await evaluateGate(params);
  
  if (decision.verdict === "deny") {
    throw new Error("RFSN gate denied tool");
  }
  
  return await params.tool.execute(params.args);
}
```

### After: Gate with security events
```typescript
// src/rfsn/dispatch.ts (new)
import { getGateEventEmissionMiddleware } from "./gate-event-emission.js";

export async function rfsnDispatch(params: { 
  tool; 
  args;
  sessionId?: string;
  agentId?: string;
  ... 
}): Promise<...> {
  const decision = await evaluateGate(params);
  const middleware = getGateEventEmissionMiddleware();
  
  middleware.emitDecision({
    verdict: decision.verdict,
    toolName: params.tool.name,
    reason: decision.reason,
    sessionId: params.sessionId,
    agentId: params.agentId,
    policyHash: params.policy?.hash,
    sandboxed: params.sandbox?.mode === "non-main",
  });
  
  if (decision.verdict === "deny") {
    throw new Error("RFSN gate denied tool");
  }
  
  return await params.tool.execute(params.args);
}
```

## 2. Health Endpoints in Gateway

### Setup Express/Fastify Health Routes

```typescript
// src/gateway/server.ts (main gateway file)
import express from "express";
import { 
  mountHealthEndpoints,
  type GatewayRuntimeState 
} from "./health-endpoints.js";
import { HealthBuilder, computeHealthStatus } from "../runtime/health-model.js";

const app = express();
const runtimeState: GatewayRuntimeState = {
  gatewayStartedAtMs: Date.now(),
};

// Define async health computation
async function computeRuntimeHealth() {
  const builder = new HealthBuilder()
    .setLiveness(true)
    .clearReadinessBlockers()
    .clearSecurityIssues();
  
  // Check gateway auth
  if (!config.gateway?.mode) {
    builder.addReadinessBlocker("gateway auth not configured");
  }
  
  // Check components
  builder.addComponent("gateway", "healthy", "Running");
  builder.addComponent("auth", "healthy", "Configured");
  
  // Check optional subsystems
  if (browserSubsystem && !browserSubsystem.ready) {
    builder.markDegraded("browser-subsystem");
  }
  
  return builder.build();
}

// Mount all health endpoints
mountHealthEndpoints(app, runtimeState, computeRuntimeHealth);

// Now available:
// GET /health        -> full health status
// GET /ready         -> readiness check
// GET /alive         -> liveness check
// GET /status        -> quick status
// GET /metrics       -> Prometheus metrics
```

### Monitor Health Endpoints

```bash
# Check full health
curl http://localhost:18789/health | jq

# Check readiness (returns 200 if ready, 503 if not)
curl http://localhost:18789/ready

# Check liveness (always 200 if process alive)
curl http://localhost:18789/alive

# Get Prometheus metrics
curl http://localhost:18789/metrics
```

## 3. Doctor Checks in Startup Flow

### Integrate Doctor into Gateway Startup

```typescript
// src/gateway/server.ts (in startup function)
import { runDoctorReport, formatDoctorReport } from "../cli/startup-doctor.js";

async function startGateway(config: OpenClawConfig) {
  // 1. Run doctor checks
  const doctorReport = await runDoctorReport({
    cfg: config,
    env: process.env,
  });
  
  // 2. Log results
  console.log(formatDoctorReport(doctorReport).join("\n"));
  
  // 3. Fail if critical issues found
  if (!doctorReport.readyForOperation) {
    console.error("Critical startup issues found. Use 'openclaw doctor' for details.");
    process.exit(1);
  }
  
  // 4. Proceed with startup
  // ...rest of startup code
}
```

## 4. Extended Security Events

### Emit Extended Events for Detailed Scenarios

```typescript
// Example: In subprocess execution
import { 
  emitToolInvocationTimeout,
  emitResourceLimitExceeded,
  emitDangerousActionLimiterTriggered 
} from "../security/security-events-extended-emit.js";

// When tool execution times out
if (elapsedMs > timeoutMs) {
  emitToolInvocationTimeout({
    emitter,
    toolName: "exec",
    timeoutMs,
    sessionId,
    sandboxed: true,
    terminationSignal: "SIGKILL",
  });
}

// When resource limit exceeded
if (stdoutBytes > maxBytes) {
  emitResourceLimitExceeded({
    emitter,
    resourceType: "stdout",
    limit: maxBytes,
    current: stdoutBytes,
    unit: "bytes",
    toolName: "exec",
    sessionId,
  });
}

// When dangerous action limiter triggered
if (currentCount >= maxLimit) {
  emitDangerousActionLimiterTriggered({
    emitter,
    currentCount,
    maxLimit,
    action: "exec",
    sessionId,
  });
}
```

## 5. Using Reliability Patterns

### Replace Manual Intervals with SafeInterval

```typescript
// Before: Manual interval with poor error handling
let checkInterval: NodeJS.Timeout | null = null;

function startHealthCheck() {
  checkInterval = setInterval(() => {
    // May throw unhandled error
    computeHealth();
  }, 5000);
}

function stopHealthCheck() {
  if (checkInterval) clearInterval(checkInterval);
}

// After: Using SafeInterval
import { SafeInterval } from "../runtime/reliability-patterns.js";

let healthCheck: SafeInterval | null = null;

function startHealthCheck() {
  healthCheck = new SafeInterval(
    async () => {
      const health = await computeRuntimeHealth();
      runtimeState.currentHealth = health;
    },
    5000,
    "health-check"
  ).start();
}

function stopHealthCheck() {
  healthCheck?.stop();
}
```

### Use Graceful Shutdown Pattern

```typescript
import { GracefulShutdown, ResourceLifecycle } from "../runtime/reliability-patterns.js";

// During gateway initialization
const shutdown = new GracefulShutdown();
const lifecycle = new ResourceLifecycle();

// Register shutdown handlers
shutdown.onShutdown(async () => {
  // Close HTTP server
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

shutdown.onShutdown(async () => {
  // Clean up resources
  await lifecycle.cleanup();
});

// Register resources for cleanup
lifecycle.register("browser", async () => {
  await browserSubsystem?.close();
});

lifecycle.register("cache", async () => {
  await cacheBackend?.flush();
});

// Handle SIGTERM
process.on("SIGTERM", async () => {
  await shutdown.shutdown("SIGTERM received");
  process.exit(0);
});
```

## 6. Testing with Enhanced Smoke Tests

### Run All Smoke Tests

```bash
# Base smoke tests (11 tests)
pnpm test src/cli/smoke-tests.test.ts --run

# Enhanced smoke tests with performance/degradation (12+ tests)
pnpm test src/cli/enhanced-smoke-tests.test.ts --run

# All smoke tests together
pnpm test src/cli/*smoke*.test.ts --run
```

### Expected Output

```
✓ smoke: gateway starts with sane config (2ms)
✓ smoke: startup invariants pass (5ms)
✓ smoke: doctor report shows readiness (10ms)
✓ smoke: authority-boundary structural integrity (3ms)
✓ smoke: browser-proxy disabled by default (1ms)
✓ smoke: local-shell disabled by default (1ms)
✓ smoke: health model initialization is fast (1ms)
✓ smoke: dangerous-path RFSN gate enforcement (5ms)
✓ smoke: security event emission is fast (2ms)
✓ smoke: health model handles degradation (3ms)
✓ smoke: safe interval error handling (45ms)
✓ smoke: retry with backoff mechanism (25ms)

Test Files  2 passed (2)
Tests      23 passed (23)
Start at   14:45:30
Duration   180ms
```

## 7. Docker/Kubernetes Integration

### Kubernetes Health Probes

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: openclaw-gateway
spec:
  containers:
  - name: gateway
    image: openclaw/gateway:latest
    ports:
    - containerPort: 18789
    
    # Liveness probe: detects dead process
    livenessProbe:
      httpGet:
        path: /alive
        port: 18789
      initialDelaySeconds: 5
      periodSeconds: 10
      failureThreshold: 3
    
    # Readiness probe: waits for startup complete
    readinessProbe:
      httpGet:
        path: /ready
        port: 18789
      initialDelaySeconds: 10
      periodSeconds: 5
      failureThreshold: 3
    
    # Startup probe: allows time for initialization
    startupProbe:
      httpGet:
        path: /health
        port: 18789
      initialDelaySeconds: 0
      periodSeconds: 2
      failureThreshold: 30  # 60 seconds total
```

### Docker Healthcheck

```dockerfile
FROM node:22-alpine

WORKDIR /app
COPY . .

RUN npm ci --production

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:18789/health || exit 1

CMD ["npm", "start"]
```

## 8. Monitoring & Alerting

### Prometheus Scrape Config

```yaml
scrape_configs:
  - job_name: 'openclaw-gateway'
    static_configs:
      - targets: ['localhost:18789']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Alerting Rules

```yaml
groups:
  - name: openclaw-gateway
    rules:
      - alert: GatewayNotReady
        expr: openclaw_ready == 0
        for: 5m
        annotations:
          summary: "OpenClaw gateway is not ready"
      
      - alert: GatewayUnhealthy
        expr: openclaw_health_status == 2
        for: 1m
        annotations:
          summary: "OpenClaw gateway is unhealthy"
      
      - alert: DegradedSubsystems
        expr: openclaw_degraded_subsystems > 0
        for: 10m
        annotations:
          summary: "OpenClaw has {{ $value }} degraded subsystems"
```

## 9. Complete Startup Checklist

```bash
# 1. Install dependencies
npm install

# 2. Build project
npm run build

# 3. Run security checks
pnpm security:check

# 4. Run startup doctor
openclaw doctor

# 5. Run smoke tests
pnpm test src/cli/smoke-tests.test.ts --run
pnpm test src/cli/enhanced-smoke-tests.test.ts --run

# 6. Start gateway and monitor health
openclaw gateway &
curl http://localhost:18789/health | jq

# 7. Check readiness
curl -v http://localhost:18789/ready

# 8. Verify security events flowing
tail -f /tmp/openclaw/openclaw-*.log | jq '.security_event'
```

## Files Modified/Created

### New Files
- `src/rfsn/gate-event-emission.ts` - Gate event emission middleware
- `src/security/security-events-extended.ts` - Extended event type definitions
- `src/security/security-events-extended-emit.ts` - Extended event helpers
- `src/gateway/health-endpoints.ts` - HTTP health endpoint handlers
- `src/cli/enhanced-smoke-tests.test.ts` - Enhanced smoke tests
- `COMPREHENSIVE_AUDIT_REPORT.md` - Full audit and recommendations
- `INTEGRATION_GUIDE.md` - This file

### Integration Points
- `src/rfsn/dispatch.ts` - Add event emission
- `src/gateway/server.ts` - Mount health endpoints, run doctor
- `src/gateway/server-startup.ts` - Integrate startup checks

## Next Steps

1. **Immediate (This Sprint)**
   - [ ] Integrate RFSN gate event emission
   - [ ] Add health endpoints to gateway
   - [ ] Run doctor checks in startup

2. **Short Term**
   - [ ] Deploy and monitor health endpoints
   - [ ] Set up Kubernetes probes
   - [ ] Configure alerting rules

3. **Medium Term**
   - [ ] Add extended event types to RFSN flows
   - [ ] Implement subsystem detailed health tracking
   - [ ] Add performance baselines to monitoring

4. **Long Term**
   - [ ] Build operational dashboard
   - [ ] Add cross-instance health federation
   - [ ] Implement predictive degradation detection
