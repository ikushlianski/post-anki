import { runKnownCardsJudge, type KnownCardsJudgeOutput } from "../mastra/known-cards-judge.agent.js";
import { escapePromptTags, sanitizeUntrustedLine } from "../shared/untrusted-prompt-text.js";
import { KNOWN_CARDS_NOTE_EXCERPT_CHARS } from "./known-cards.config.js";
import {
  KnownCardsLedgeredError,
  type JudgedKnownCard,
  type KnownCardCandidate,
} from "./known-cards.types.js";

const BODY_CHARS = 300;
const QUESTION_CHARS = 150;
const ANSWER_CHARS = 150;
const REASON_CHARS = 120;
const OVERLAP_CHARS = 160;

export interface JudgePrompt {
  prompt: string;
  aliases: Map<string, KnownCardCandidate>;
}

export function buildJudgePrompt(chunkText: string, candidates: KnownCardCandidate[]): JudgePrompt {
  const aliases = new Map<string, KnownCardCandidate>();
  const cards = candidates.map((candidate, index) => {
    const alias = `K${index + 1}`;

    aliases.set(alias, candidate);

    const lines = [`Statement: ${sanitizeUntrustedLine(candidate.body, BODY_CHARS)}`];

    if (candidate.question) {
      lines.push(`Q: ${sanitizeUntrustedLine(candidate.question, QUESTION_CHARS)}`);
    }

    if (candidate.answer) {
      lines.push(`A: ${sanitizeUntrustedLine(candidate.answer, ANSWER_CHARS)}`);
    }

    return `${alias}:\n<known_card>\n${lines.join("\n")}\n</known_card>`;
  });
  const note = escapePromptTags(chunkText.slice(0, KNOWN_CARDS_NOTE_EXCERPT_CHARS));

  return { aliases, prompt: `<note>\n${note}\n</note>\n\n${cards.join("\n\n")}` };
}

export function validateJudgeOutput(output: KnownCardsJudgeOutput, aliases: Map<string, KnownCardCandidate>): JudgedKnownCard[] {
  const seen = new Set<string>();
  const judged: JudgedKnownCard[] = [];

  for (const entry of output.candidates) {
    const alias = entry.alias.trim().toUpperCase();
    const candidate = aliases.get(alias);

    if (!candidate || seen.has(alias)) {
      continue;
    }

    seen.add(alias);

    if (entry.verdict === "unrelated") {
      continue;
    }

    judged.push({
      id: candidate.id,
      verdict: entry.verdict,
      overlap: sanitizeUntrustedLine(entry.overlap, OVERLAP_CHARS),
      reason: sanitizeUntrustedLine(entry.reason, REASON_CHARS),
      question: sanitizeUntrustedLine(candidate.question ?? candidate.body, QUESTION_CHARS),
      answer: sanitizeUntrustedLine(candidate.answer ?? "", ANSWER_CHARS),
    });
  }

  return judged;
}

export async function judgeKnownCards(
  chunkText: string,
  candidates: KnownCardCandidate[],
  knowledgeSourceId: string | null,
): Promise<JudgedKnownCard[]> {
  const { prompt, aliases } = buildJudgePrompt(chunkText, candidates);
  let output: KnownCardsJudgeOutput;

  try {
    output = await runKnownCardsJudge(prompt, knowledgeSourceId);
  } catch (err) {
    throw new KnownCardsLedgeredError("judge", err);
  }

  return validateJudgeOutput(output, aliases);
}
