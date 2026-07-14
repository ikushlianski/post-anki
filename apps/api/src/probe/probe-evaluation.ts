import type { Gap, ProbeEvaluation, SubmitProbeInput } from "@post-anki/shared";

export function shouldScoreLocally(
  mode: SubmitProbeInput["mode"],
  probed: Gap | null,
): boolean {
  return probed !== null && mode === "quick_test";
}

export function localEvaluation(
  probed: Gap,
  selfOutcome: SubmitProbeInput["selfOutcome"],
): ProbeEvaluation {
  return {
    verdicts: [{ gapId: probed.id, covered: selfOutcome === "pass" }],
    newGaps: [],
    nextPrompt: null,
  };
}
