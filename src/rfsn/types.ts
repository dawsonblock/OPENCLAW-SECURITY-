export type RfsnRisk = "low" | "medium" | "high";

export type RfsnDecisionVerdict = "allow" | "deny" | "require_human" | "require_sandbox_only";

export type RfsnCapability = string;

export type RfsnProvenance = {
  modelProvider?: string;
  modelId?: string;
  policySha256?: string;
  promptHash?: string;
  contextRefs?: string[];
};

export type RfsnActionProposal = {
  id: string;
  timestampMs: number;
  actor: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  toolName: string;
  args: unknown;
  capabilitiesRequired?: RfsnCapability[];
  risk?: RfsnRisk;
  provenance?: RfsnProvenance;
};

export type RfsnGateDecision = {
  verdict: RfsnDecisionVerdict;
  reasons: string[];
  risk: RfsnRisk;
  normalizedArgs?: unknown;
  capsGranted?: RfsnCapability[];
};

export type RfsnActionResult = {
  status: "ok" | "error";
  toolName: string;
  summary?: string;
  exitCode?: number;
  durationMs: number;
  sideEffects?: {
    filesWritten?: string[];
    networkCalls?: string[];
    spawnedProcesses?: string[];
  };
};

export type RfsnLedgerEntry =
  | {
      type: "proposal";
      timestampMs: number;
      proposal: RfsnActionProposal;
    }
  | {
      type: "decision";
      timestampMs: number;
      proposalId: string;
      decision: RfsnGateDecision;
    }
  | {
      type: "result";
      timestampMs: number;
      proposalId: string;
      result: RfsnActionResult;
    }
  | {
      type: "error";
      timestampMs: number;
      proposalId: string;
      error: {
        name: string;
        message: string;
      };
    }
  | {
      type: "memory_write";
      timestampMs: number;
      proposalId?: string;
      payload: Record<string, unknown>;
    }
  | {
      type: "artifact";
      timestampMs: number;
      proposalId?: string;
      artifact: {
        kind: string;
        path?: string;
        metadata?: Record<string, unknown>;
      };
    };

export type RfsnLedgerEnvelope = {
  prevHash: string;
  hash: string;
  payload: RfsnLedgerEntry;
};
