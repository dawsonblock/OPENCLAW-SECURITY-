import { failInvariant, SecurityInvariantViolation } from "./invariants.js";

export const EXECUTOR_GUARD_SYMBOL = Symbol("EXECUTOR_GUARD");

/**
 * Marks a context object as originating from the authorized executor path.
 */
export function markExecutorContext(context: Record<string | symbol, unknown>) {
  context[EXECUTOR_GUARD_SYMBOL] = true;
}

/**
 * Asserts that the execution context carries the authorized marker.
 */
export function assertCanonicalExecutor(context: Record<string | symbol, unknown>) {
  if (!context || !context[EXECUTOR_GUARD_SYMBOL]) {
    failInvariant(
      SecurityInvariantViolation.EXECUTOR_NON_CANONICAL,
      "Execution attempted without canonical executor context marker",
    );
  }
}
