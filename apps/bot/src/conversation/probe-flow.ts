import type {
  DailyPushResponse,
  ProbeQuestion,
  ProbeResult,
  QuestionKind,
} from "@post-anki/shared";
import type { Pending, SubmitAnswerInput } from "./flow-types.js";

export interface FlowDeps {
  getDailyPush: (mode: QuestionKind) => Promise<DailyPushResponse>;
  submitAnswer: (input: SubmitAnswerInput) => Promise<ProbeResult>;
  getPending: (chatId: number) => Promise<Pending | null>;
  setPending: (chatId: number, pending: Pending) => Promise<void>;
  clearPending: (chatId: number) => Promise<void>;
}

export const NO_PUSH_REPLY =
  "Nothing queued for today — confirm a curriculum and I'll start pushing questions.";
export const NO_PENDING_REPLY =
  "No question in flight. Send /today for today's question.";

export function formatQuestion(question: ProbeQuestion): string {
  const lines: string[] = [
    question.gapLabel ? `🎯 ${question.gapLabel}` : "🧭 Opening question",
    "",
    question.prompt,
  ];

  if (question.options && question.options.length > 0) {
    lines.push("");
    question.options.forEach((opt, i) => lines.push(`${i + 1}. ${opt}`));
  }

  return lines.join("\n");
}

export function formatResult(result: ProbeResult): string {
  const head = result.outcome === "pass" ? "✅" : "📝";
  const covered =
    result.coveredGapLabels.length > 0
      ? `\nCovered: ${result.coveredGapLabels.join(", ")}`
      : "";

  return `${head} ${result.feedback}${covered}`;
}

export async function sendTodaysQuestion(
  chatId: number,
  mode: QuestionKind,
  deps: FlowDeps,
): Promise<string> {
  const { push, question } = await deps.getDailyPush(mode);

  if (!push || !question) {
    return NO_PUSH_REPLY;
  }

  await deps.setPending(chatId, {
    topicId: push.topicId,
    gapId: question.gapId,
    mode,
  });

  return `📚 ${push.curriculumName} › ${push.topicTitle}\n\n${formatQuestion(question)}`;
}

export async function answerPending(
  chatId: number,
  text: string,
  deps: FlowDeps,
): Promise<string> {
  const pending = await deps.getPending(chatId);

  if (!pending) {
    return NO_PENDING_REPLY;
  }

  const result = await deps.submitAnswer({
    topicId: pending.topicId,
    gapId: pending.gapId,
    mode: pending.mode,
    answer: text,
  });

  if (result.nextQuestion) {
    await deps.setPending(chatId, {
      topicId: pending.topicId,
      gapId: result.nextQuestion.gapId,
      mode: pending.mode,
    });

    return `${formatResult(result)}\n\n${formatQuestion(result.nextQuestion)}`;
  }

  await deps.clearPending(chatId);

  return `${formatResult(result)}\n\nThat's it for this topic. Send /today for the next push.`;
}
