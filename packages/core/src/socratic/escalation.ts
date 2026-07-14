export type SocraticDegree = "correct" | "slightly_wrong" | "mostly_wrong";

export type SocraticAction =
  | "advance"
  | "point_out"
  | "explain_hint"
  | "give_answer";

export interface SocraticTurnInput {
  degree: SocraticDegree;
  priorWrongCount: number;
}

export function deriveSocraticAction(input: SocraticTurnInput): SocraticAction {
  if (input.degree === "correct") {
    return "advance";
  }

  const wrongSoFar = input.priorWrongCount + 1;

  if (wrongSoFar >= 2) {
    return "give_answer";
  }

  if (input.degree === "slightly_wrong") {
    return "point_out";
  }

  return "explain_hint";
}
