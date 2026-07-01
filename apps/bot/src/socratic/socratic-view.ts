import type {
  AnswerSocraticResult,
  SocraticSession,
  SocraticTurn,
} from "@post-anki/shared";

export function formatTurn(turn: SocraticTurn, session: SocraticSession): string {
  return [
    `🧠 ${turn.conceptLabel}`,
    `concept ${session.conceptsCovered + 1}/${session.conceptsTotal} · topic ${session.topicMaturity}%`,
    "",
    turn.prompt,
  ].join("\n");
}

export function formatSocraticAnswer(result: AnswerSocraticResult): string {
  const lines: string[] = [result.feedback];

  if (result.next) {
    lines.push(
      "",
      `🧠 ${result.next.conceptLabel}`,
      `concept ${result.conceptsCovered + 1}/${result.conceptsTotal} · topic ${result.topicMaturity}%`,
      "",
      result.next.prompt,
    );

    return lines.join("\n");
  }

  if (result.status === "completed") {
    lines.push("", `🎉 Topic complete — ${result.topicMaturity}%`);
  }

  return lines.join("\n");
}
