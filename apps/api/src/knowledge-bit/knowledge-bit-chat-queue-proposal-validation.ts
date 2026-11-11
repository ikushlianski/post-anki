import {
  BASIC_CARD_BACK_MAX_CHARS,
  BASIC_CARD_FRONT_MAX_CHARS,
  validateBasicCard,
} from "./knowledge-bit-basic-card-validation.js";
import { isYesNoQuestion } from "./knowledge-bit-yes-no-question.js";

export interface ChatQueueProposalFields {
  front: string;
  back: string;
  example?: string;
  reason?: string;
}

const PROMPT_TAG_NAMES = ["card", "history", "source_excerpt", "source_info", "learner_message", "style_notes"];
const INJECTED_MARKUP = new RegExp(`<\\s*/?\\s*(?:${PROMPT_TAG_NAMES.join("|")})(?![\\p{L}\\p{N}_])`, "iu");

const MESSAGES = {
  empty: "The card front and back must both be non-empty. Write a short question and a concise answer.",
  too_long: `The card is too long. Keep the front at ${BASIC_CARD_FRONT_MAX_CHARS} characters or fewer and the back at ${BASIC_CARD_BACK_MAX_CHARS} or fewer, then propose it again.`,
  code_not_verbatim: "The code in the card differs from the source. Copy each code block exactly as written in the source, with the same whitespace, then propose it again.",
  same_text: "The front and back are the same. Make the front a question or cue and the back its answer.",
  answer_on_front: "The front contains the answer. Rewrite the front as a cue that does not reveal the back, then propose it again.",
  wrong_language: "The card is not in the source language. Rewrite it in the same language as the source without translating, then propose it again.",
  source_meta_reference: "The card refers to the source (for example 'the text' or 'the author'). Rewrite it as standalone study material about the fact itself, then propose it again.",
} as const;

export function validateChatQueueProposal(input: ChatQueueProposalFields, sourceText: string): string | null {
  const fields = [input.front, input.back, input.example, input.reason];

  if (fields.some((field) => field !== undefined && INJECTED_MARKUP.test(field))) {
    return "The card contains markup-like tags such as <card> or <history>. Remove them and use plain text, then propose it again.";
  }

  const result = validateBasicCard(input, sourceText, sourceText.trim().length === 0);

  if (!result.ok) {
    return MESSAGES[result.reason];
  }

  if (isYesNoQuestion(result.front, "")) {
    return "The front is a yes/no question. Ask an open question (what, why, how, which) whose answer is the fact itself, then propose it again.";
  }

  return null;
}
