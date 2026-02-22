/**
 * Compresses conversational and ledger histories down to their
 * deterministic semantic summaries, preventing strict unbounded token bloat.
 */
export class ContextCompressor {
  /**
   * Stubs out an LLM/compression call that would take a large trace
   * and shrink it to its vital invariants and failure lessons.
   */
  public async compressTrace(traceLogs: string[]): Promise<string> {
    console.log(`[ContextCompressor] Compressing ${traceLogs.length} events...`);

    // Mocked summarization strategy: keeps structural boundaries and errors.
    const lines = traceLogs.filter(
      (log) =>
        log.toLowerCase().includes("error") ||
        log.toLowerCase().includes("failed") ||
        log.toLowerCase().includes("success") ||
        log.toLowerCase().includes("checkpoint"),
    );

    const summary = [
      `COMPRESSED TRACE (${traceLogs.length} original lines -> ${lines.length} lines):`,
      ...lines,
    ].join("\n");

    return summary;
  }

  /**
   * Compacts an array of historical strings if the byte size exceeds constraints.
   */
  public maintainTokenBudget(context: string[], maxTokensLimit: number = 8000): string[] {
    // Very rough naive estimate: 1 token ~= 4 chars
    const currentSizeEstimate = context.join("").length / 4;

    if (currentSizeEstimate <= maxTokensLimit) {
      return context;
    }

    console.log(
      `[ContextCompressor] Token budget exceeded (~${currentSizeEstimate} / ${maxTokensLimit}). Evicting oldest context...`,
    );

    let trimmedContext = [...context];
    while (trimmedContext.join("").length / 4 > maxTokensLimit && trimmedContext.length > 1) {
      trimmedContext.shift(); // Evict oldest
    }

    return trimmedContext;
  }
}
