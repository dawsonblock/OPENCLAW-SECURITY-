export type GateDecision = {
  allowed: boolean;
  reason?: string;
};

export interface PolicyConstraint {
  check(intent: string, payload: any): GateDecision | Promise<GateDecision>;
}

/**
 * Validates intents against strict capability profiles.
 * Disables non-deterministic flows explicitly.
 */
export class PolicyEngine {
  private constraints: PolicyConstraint[] = [];

  public registerConstraint(constraint: PolicyConstraint) {
    this.constraints.push(constraint);
  }

  public async evaluate(intent: string, payload: any): Promise<boolean> {
    for (const constraint of this.constraints) {
      const decision = await constraint.check(intent, payload);
      if (!decision.allowed) {
        console.warn(
          `Policy gate blocked intent '${intent}': ${decision.reason || "Constraint violated"}`,
        );
        return false;
      }
    }
    return true;
  }
}
