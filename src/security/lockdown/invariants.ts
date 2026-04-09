export enum SecurityInvariantViolation {
  CAPABILITY_UNREGISTERED = "CAPABILITY_UNREGISTERED",
  APPROVAL_PAYLOAD_UNBOUND = "APPROVAL_PAYLOAD_UNBOUND",
  APPROVAL_MISSING = "APPROVAL_MISSING",
  EXPOSURE_UNSAFE = "EXPOSURE_UNSAFE",
  EXECUTOR_NON_CANONICAL = "EXECUTOR_NON_CANONICAL",
  BUDGET_MISSING = "BUDGET_MISSING",
  FILESYSTEM_ESCAPE = "FILESYSTEM_ESCAPE",
  RAW_SECRET_LEAK = "RAW_SECRET_LEAK",
  POLICY_DRIFT = "POLICY_DRIFT",
  UNSAFE_STARTUP = "UNSAFE_STARTUP",
  RESOURCE_EXHAUSTION = "RESOURCE_EXHAUSTION",
  NULL_INVARIANT = "NULL_INVARIANT", // Should never happen
}

export class InvariantViolationError extends Error {
  constructor(
    public violation: SecurityInvariantViolation,
    public details: string,
    public metadata?: Record<string, unknown>,
  ) {
    super(`[SECURITY LOCKDOWN] Violation: ${violation} - ${details}`);
    this.name = "InvariantViolationError";
  }
}

/**
 * Throws a standardized InvariantViolationError.
 * This is the ONLY way a security invariant should fail.
 */
export function failInvariant(
  violation: SecurityInvariantViolation,
  details: string,
  metadata?: Record<string, unknown>,
): never {
  throw new InvariantViolationError(violation, details, metadata);
}
