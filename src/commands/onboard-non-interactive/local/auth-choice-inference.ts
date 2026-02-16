import type { OnboardOptions } from "../../onboard-types.js";

export function inferAuthChoiceFromFlags(opts: OnboardOptions): {
  matches: Array<{ label: string; value: string }>;
  choice?: string;
} {
  const matches: Array<{ label: string; value: string }> = [];
  if (opts.authChoice) {
    matches.push({ label: "Explicit Choice", value: opts.authChoice });
  }
  return {
    matches,
    choice: opts.authChoice,
  };
}
