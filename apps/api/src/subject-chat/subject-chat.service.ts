import {
  takeRecentChatMessages,
  type AskSubjectChatInput,
  type AskSubjectChatResult,
  type SubjectChatUsedBit,
} from "@post-anki/shared";
import { formatTranscript, MIN_MATCH_SIMILARITY } from "@post-anki/core";
import { generateWithRetry } from "../mastra/generate-with-retry.js";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { findSimilarApprovedKnowledgeBits } from "../knowledge-bit/knowledge-bit-approval-embedding.orchestrator.js";
import { getSubject } from "../subject/subject.repo.js";

export const NOT_COVERED_REPLY = "This subject's knowledge doesn't cover that question yet.";
export const LOOKUP_FAILED_REPLY = "I couldn't search this subject's knowledge right now — try again.";
export const FALLBACK_REPLY = "I couldn't reach the tutor right now — try again.";

const TOP_K_BITS = 6;
const BIT_BODY_CHARS = 600;
const BIT_PREVIEW_CHARS = 80;
const CONTEXT_CHARS = 1_500;
const TRANSCRIPT_TURN_CHARS = 2_000;

const FENCE_TAG = /<\/?\s*(knowledge|learner_context|conversation)\b[^>]*>/gi;

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

function stripFences(text: string): string {
  let current = text;

  for (let pass = 0; pass < 5; pass += 1) {
    const next = current.replace(FENCE_TAG, "");

    if (next === current) {
      return next;
    }

    current = next;
  }

  return current.replace(/[<>]/g, "");
}

function preview(body: string): string {
  return body.length > BIT_PREVIEW_CHARS ? `${body.slice(0, BIT_PREVIEW_CHARS)}…` : body;
}

function contextBlock(context: AskSubjectChatInput["context"]): string | null {
  if (!context) {
    return null;
  }

  const label = context.kind === "selection" ? "text the learner highlighted" : "the card the learner is viewing";

  return `<learner_context>\n(${label})\n${stripFences(clip(context.text, CONTEXT_CHARS))}\n</learner_context>`;
}

function conversationBlock(transcript: AskSubjectChatInput["transcript"]): string | null {
  const turns = takeRecentChatMessages(transcript).map((turn) => ({
    ...turn,
    text: stripFences(clip(turn.text, TRANSCRIPT_TURN_CHARS)),
  }));
  const history = formatTranscript(turns, { assistantLabel: "Tutor" });

  return history ? `<conversation>\n${history}\n</conversation>` : null;
}

function buildPrompt(
  input: AskSubjectChatInput,
  bits: { id: string; body: string }[],
): string {
  const knowledge = bits.map((bit, i) => `[${i + 1}] ${stripFences(clip(bit.body, BIT_BODY_CHARS))}`);

  return [
    `<knowledge>\n${knowledge.join("\n")}\n</knowledge>`,
    contextBlock(input.context),
    conversationBlock(input.transcript),
    `Learner question: ${input.message}`,
  ]
    .filter((section): section is string => Boolean(section))
    .join("\n\n");
}

function queryText(input: AskSubjectChatInput): string {
  return input.context ? `${input.message}\n${clip(input.context.text, CONTEXT_CHARS)}` : input.message;
}

function failure(reply: string, lookupFailed: boolean): AskSubjectChatResult {
  return { reply, usedBits: [], lookupFailed, noMatch: false };
}

export async function askSubjectChat(
  input: AskSubjectChatInput,
): Promise<AskSubjectChatResult | "subject_not_found"> {
  if (!(await getSubject(input.subjectId))) {
    return "subject_not_found";
  }

  let bits: { id: string; body: string }[];

  try {
    bits = await findSimilarApprovedKnowledgeBits(
      queryText(input),
      TOP_K_BITS,
      MIN_MATCH_SIMILARITY,
      input.subjectId,
    );
  } catch (err) {
    log.error({ err }, "subject_chat_lookup_failed");

    return failure(LOOKUP_FAILED_REPLY, true);
  }

  if (bits.length === 0) {
    return { reply: NOT_COVERED_REPLY, usedBits: [], lookupFailed: false, noMatch: true };
  }

  const usedBits: SubjectChatUsedBit[] = bits.map((bit) => ({ id: bit.id, preview: preview(bit.body) }));

  try {
    const agent = getMastra().getAgent(AGENT_KEYS.subjectChat);
    const result = await generateWithRetry("subject_chat_reply", null, AGENT_KEYS.subjectChat, () =>
      agent.generate(buildPrompt(input, bits)),
    );
    const reply = result.text?.trim();

    if (reply) {
      return { reply, usedBits, lookupFailed: false, noMatch: false };
    }
  } catch (err) {
    log.error({ err }, "subject_chat_failed");
  }

  return failure(FALLBACK_REPLY, false);
}
