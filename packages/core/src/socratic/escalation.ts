import type { DepthLevel } from "@post-anki/shared";

export type SocraticDegree = "correct" | "slightly_wrong" | "mostly_wrong";

export type SocraticAction =
  | "advance"
  | "point_out"
  | "explain_hint"
  | "give_answer"
  | "move_on";

export interface SocraticTurnInput {
  degree: SocraticDegree;
  priorWrongCount: number;
  priorEverPartial: boolean;
  depth: DepthLevel;
}

const FOLLOW_UP_CAP: Record<DepthLevel, number> = {
  awareness: 2,
  working: 2,
  deep: 3,
};

export function deriveSocraticAction(input: SocraticTurnInput): SocraticAction {
  if (input.degree === "correct") {
    return "advance";
  }

  const wrongSoFar = input.priorWrongCount + 1;
  const cap = FOLLOW_UP_CAP[input.depth];

  if (wrongSoFar >= cap) {
    const everPartial = input.priorEverPartial || input.degree === "slightly_wrong";

    return everPartial ? "give_answer" : "move_on";
  }

  if (input.degree === "slightly_wrong") {
    return "point_out";
  }

  return "explain_hint";
}

export function hasPriorPartial(
  turns: { gapId: string | null; degree: string | null }[],
  gapId: string | null,
): boolean {
  return turns.some((t) => t.gapId === gapId && t.degree === "slightly_wrong");
}

export function countPriorWrong(
  turns: { gapId: string | null; degree: string | null }[],
  gapId: string | null,
): number {
  return turns.filter(
    (t) =>
      t.gapId === gapId &&
      (t.degree === "slightly_wrong" || t.degree === "mostly_wrong"),
  ).length;
}
