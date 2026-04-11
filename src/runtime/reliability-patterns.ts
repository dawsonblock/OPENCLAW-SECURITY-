/**
 * Long-running service reliability patterns and guardrails.
 *
 * E5.1: Added instrumentation hooks for metrics collection.
 *
 * Common pitfalls in long-lived processes:
 * - Repeated retry loops with weak backoff
 * - Unhandled promise rejections
 * - Resource leaks in watchers/intervals/listeners
 * - Missing abort/timeout paths
 * - Noisy failure logging
 * - Unclear shutdown semantics
 *
 * Provides helpers for:
 * - Safe interval/timeout cleanup
 * - Structured backoff with jitter
 * - Graceful degradation on transient failures
 * - Clear resource ownership
 * - Instrumentation for metrics
 */

import { EventEmitter } from "node:events";

/**
 * Backoff configuration for retryable operations.
 */
export interface BackoffConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number; // 0-1, applied to delay for randomization
  maxAttempts?: number;
}

/**
 * Exponential backoff with jitter.
 */
export function computeBackoffDelay(config: BackoffConfig, attempt: number): number {
  const exponentialDelay = Math.min(
    config.initialDelayMs * Math.pow(2, attempt),
    config.maxDelayMs,
  );
  const jitter = exponentialDelay * config.jitterFactor * Math.random();
  return exponentialDelay + jitter;
}

/**
 * Options for a retryable operation.
 */
export interface RetryableConfig extends BackoffConfig {
  label: string; // for logging
  onRetry?: (attempt: number, delay: number, error: Error) => void;
  onMaxAttemptsExceeded?: (error: Error) => void;
}

/**
 * Safely retry an async operation with backoff.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryableConfig,
): Promise<T> {
  let lastError: Error | undefined;
  const maxAttempts = config.maxAttempts ?? 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxAttempts - 1) {
        const delay = computeBackoffDelay(config, attempt);
        config.onRetry?.(attempt + 1, delay, lastError);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  const error = lastError ?? new Error(`${config.label} failed after ${maxAttempts} attempts`);
  config.onMaxAttemptsExceeded?.(error);
  throw error;
}

/**
 * E5.1: Metrics for SafeInterval instrumentation.
 */
export interface SafeIntervalMetrics {
  iterationsCompleted: number;
  iterationsFailed: number;
  lastIterationTimeMs: number;
  averageIterationTimeMs: number;
  totalRunTimeMs: number;
}

/**
 * Safe interval management with cleanup.
 * E5.1: Added metrics collection and backpressure detection.
 */
export class SafeInterval {
  private handle: NodeJS.Timeout | null = null;
  private isCancelled = false;
  // E5.1: Instrumentation fields
  private iterationsCompleted = 0;
  private iterationsFailed = 0;
  private lastIterationTimeMs = 0;
  private totalIterationTimeMs = 0;
  private startTimeMs = 0;
  private lastIterationStartMs = 0;
  private onBackpressure?: (consecutiveMissedIntervals: number) => void;
  private lastIterationComplete = true;
  private consecutiveMissedIntervals = 0;

  constructor(
    private fn: () => void | Promise<void>,
    private intervalMs: number,
    private label?: string,
  ) {}

  /**
   * E5.1: Set backpressure callback.
   */
  setBackpressureHandler(callback: (consecutiveMissedIntervals: number) => void): this {
    this.onBackpressure = callback;
    return this;
  }

  start(): this {
    if (this.isCancelled) {
      return this;
    }

    this.startTimeMs = Date.now();
    this.handle = setInterval(async () => {
      if (this.isCancelled) {
        return;
      }

      // E5.1: Backpressure detection
      if (!this.lastIterationComplete) {
        this.consecutiveMissedIntervals++;
        this.onBackpressure?.(this.consecutiveMissedIntervals);
        return;
      }

      this.lastIterationComplete = false;
      this.lastIterationStartMs = Date.now();

      try {
        await this.fn();
        this.iterationsCompleted++;
        this.consecutiveMissedIntervals = 0;
      } catch (err) {
        this.iterationsFailed++;
        console.error(`[SafeInterval:${this.label}] Interval function failed:`, err);
      } finally {
        const elapsed = Date.now() - this.lastIterationStartMs;
        this.lastIterationTimeMs = elapsed;
        this.totalIterationTimeMs += elapsed;
        this.lastIterationComplete = true;
      }
    }, this.intervalMs);

    return this;
  }

  stop(): this {
    if (this.handle !== null) {
      clearInterval(this.handle);
      this.handle = null;
    }
    this.isCancelled = true;
    return this;
  }

  /**
   * E5.1: Get metrics for this interval.
   */
  getMetrics(): SafeIntervalMetrics {
    return {
      iterationsCompleted: this.iterationsCompleted,
      iterationsFailed: this.iterationsFailed,
      lastIterationTimeMs: this.lastIterationTimeMs,
      averageIterationTimeMs:
        this.iterationsCompleted > 0
          ? Math.round(this.totalIterationTimeMs / this.iterationsCompleted)
          : 0,
      totalRunTimeMs: this.startTimeMs > 0 ? Date.now() - this.startTimeMs : 0,
    };
  }
}

/**
 * Safe timeout with automatic cleanup.
 */
export class SafeTimeout {
  private handle: NodeJS.Timeout | null = null;
  private isExecuted = false;

  constructor(
    private fn: () => void | Promise<void>,
    private delayMs: number,
  ) {}

  start(): this {
    this.handle = setTimeout(async () => {
      if (this.isExecuted) {
        return;
      }

      this.isExecuted = true;

      try {
        await this.fn();
      } catch (err) {
        // Log but don't throw.
        console.error("[SafeTimeout] Timeout function failed:", err);
      }
    }, this.delayMs);

    return this;
  }

  cancel(): this {
    if (this.handle !== null) {
      clearTimeout(this.handle);
      this.handle = null;
    }
    return this;
  }
}

/**
 * Resource lifecycle manager for long-running processes.
 *
 * Ensures cleanup happens in reverse order of creation.
 */
export class ResourceLifecycle extends EventEmitter {
  private resources: Array<{
    name: string;
    cleanup: () => Promise<void> | void;
  }> = [];

  /**
   * Register a resource that needs cleanup.
   */
  register(name: string, cleanup: () => Promise<void> | void): this {
    this.resources.push({ name, cleanup });
    return this;
  }

  /**
   * Clean up all registered resources in reverse order.
   */
  async cleanup(): Promise<void> {
    const errors: Array<{ name: string; error: Error }> = [];

    // Clean up in reverse order.
    for (let i = this.resources.length - 1; i >= 0; i--) {
      const resource = this.resources[i];
      if (!resource) {
        continue;
      }

      try {
        await Promise.resolve(resource.cleanup());
      } catch (err) {
        errors.push({
          name: resource.name,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }

    if (errors.length > 0) {
      const summary = errors.map((e) => `${e.name}: ${e.error.message}`).join("; ");
      throw new Error(`Cleanup failed for resources: ${summary}`);
    }
  }
}

/**
 * Graceful shutdown controller for long-running services.
 */
export class GracefulShutdown {
  private shutdownInProgress = false;
  private shutdownHandlers: Array<() => Promise<void> | void> = [];

  /**
   * Register a handler to call during graceful shutdown.
   */
  onShutdown(handler: () => Promise<void> | void): this {
    this.shutdownHandlers.push(handler);
    return this;
  }

  /**
   * Initiate graceful shutdown.
   */
  async shutdown(reason?: string): Promise<void> {
    if (this.shutdownInProgress) {
      return;
    }

    this.shutdownInProgress = true;

    if (reason) {
      console.log(`[GracefulShutdown] Starting graceful shutdown: ${reason}`);
    }

    const errors: Error[] = [];

    for (const handler of this.shutdownHandlers) {
      try {
        await Promise.resolve(handler());
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }

    if (errors.length > 0) {
      console.error(
        `[GracefulShutdown] ${errors.length} handler(s) failed during shutdown`,
        errors,
      );
    }
  }
}

/**
 * Create a structured error context for better debugging.
 */
export class OperationContext {
  readonly startTime = Date.now();
  private metadata: Record<string, unknown> = {};

  constructor(
    private label: string,
    private log?: (msg: string) => void,
  ) {}

  addMetadata(key: string, value: unknown): this {
    this.metadata[key] = value;
    return this;
  }

  elapsedMs(): number {
    return Date.now() - this.startTime;
  }

  success(message: string): void {
    const elapsed = this.elapsedMs();
    this.log?.(`[${this.label}] SUCCESS (${elapsed}ms): ${message}`);
  }

  failure(error: Error): void {
    const elapsed = this.elapsedMs();
    this.log?.(
      `[${this.label}] FAILURE (${elapsed}ms): ${error.message} | metadata: ${JSON.stringify(this.metadata)}`,
    );
  }
}
