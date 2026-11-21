import { runCardSynthesisWriter, type CardSynthesisWriterOutput } from "../mastra/card-synthesis-writer.agent.js";
import type { LlmCallAudit } from "../llm-call-events/llm-call-audit.js";
import { sanitizeUntrustedLine } from "../shared/untrusted-prompt-text.js";
import { buildWriterPrompt } from "./card-synthesis-mining.prompt.js";
import {
  UngroundedOverviewError,
  type EvidenceCard,
  type OverviewDraft,
  type OverviewStep,
} from "./card-synthesis-mining.types.js";

export const OVERVIEW_MIN_STEPS = 3;
export const OVERVIEW_MAX_STEPS = 12;
const LEAD_CHARS = 300;
const TECHNIQUE_CHARS = 80;
const STEP_TEXT_CHARS = 240;

export function validateOverview(
  output: CardSynthesisWriterOutput,
  aliases: Map<string, EvidenceCard>,
): OverviewDraft {
  const lead = sanitizeUntrustedLine(output.lead, LEAD_CHARS);

  if (lead.length === 0) {
    throw new UngroundedOverviewError("empty lead");
  }

  if (output.steps.length < OVERVIEW_MIN_STEPS || output.steps.length > OVERVIEW_MAX_STEPS) {
    throw new UngroundedOverviewError("step count out of range");
  }

  const steps = output.steps.map((step): OverviewStep => {
    const evidenceBitIds = [
      ...new Set(
        step.evidenceCardIds.flatMap((alias) => {
          const card = aliases.get(alias.trim().toUpperCase());

          return card ? [card.id] : [];
        }),
      ),
    ];
    const technique = sanitizeUntrustedLine(step.technique, TECHNIQUE_CHARS);
    const text = sanitizeUntrustedLine(step.text, STEP_TEXT_CHARS);

    if (evidenceBitIds.length === 0 || technique.length === 0 || text.length === 0) {
      throw new UngroundedOverviewError("step without evidence");
    }

    return { technique, text, evidenceBitIds };
  });

  return { lead, steps };
}

export async function writeOverview(
  cards: EvidenceCard[],
  title: string,
  audit: LlmCallAudit,
): Promise<OverviewDraft> {
  const { prompt, aliases } = buildWriterPrompt(cards, title);
  const output = await runCardSynthesisWriter(prompt, audit);

  return validateOverview(output, aliases);
}
