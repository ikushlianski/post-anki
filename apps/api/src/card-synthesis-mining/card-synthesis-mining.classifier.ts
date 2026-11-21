import { runCardSynthesisClassifier } from "../mastra/card-synthesis-classifier.agent.js";
import type { LlmCallAudit } from "../llm-call-events/llm-call-audit.js";
import { sanitizeUntrustedLine } from "../shared/untrusted-prompt-text.js";
import { buildClassifierPrompt } from "./card-synthesis-mining.prompt.js";
import type { ClassifierVerdict, EvidenceCard } from "./card-synthesis-mining.types.js";

const TITLE_MAX_CHARS = 140;
const TITLE_MIN_CHARS = 8;
const REASON_MAX_CHARS = 200;

export async function classifyCluster(cards: EvidenceCard[], audit: LlmCallAudit): Promise<ClassifierVerdict> {
  const { prompt } = buildClassifierPrompt(cards);
  const output = await runCardSynthesisClassifier(prompt, audit);
  const title = sanitizeUntrustedLine(output.title, TITLE_MAX_CHARS);
  const reason = sanitizeUntrustedLine(output.reason, REASON_MAX_CHARS);

  if (!output.isChain) {
    return { isChain: false, title: "", reason };
  }

  if (title.length < TITLE_MIN_CHARS) {
    throw new Error("card_synthesis_invalid_output: chain without usable title");
  }

  return { isChain: true, title, reason };
}
