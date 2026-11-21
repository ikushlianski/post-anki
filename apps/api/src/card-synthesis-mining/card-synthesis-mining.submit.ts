import { createHash } from "node:crypto";
import { getDb } from "../db/client.js";
import { findSourcesByImportKeys, insertKeyedKnowledgeSources } from "../knowledge-source/knowledge-source-keyed-insert.repo.js";
import { insertPendingManualItem } from "../knowledge-bit/knowledge-bit-manual-item.repo.js";
import { sanitizeUntrustedLine } from "../shared/untrusted-prompt-text.js";
import type { EvidenceCard, OverviewCard, OverviewDraft } from "./card-synthesis-mining.types.js";

export const SYNTHESIS_ORIGIN = "synthesis";
export const SYNTHESIS_SOURCE_STATUS = "detected";
const SNIPPET_CHARS = 80;

export type SubmitResult =
  | { status: "created"; sourceId: string; bitId: string }
  | { status: "already_present" };

class RollbackSubmit extends Error {}

export function synthesisImportKey(subjectId: string, evidenceBitIds: string[]): string {
  const digest = createHash("sha256").update([...evidenceBitIds].sort().join("|")).digest("hex");

  return `synthesis:${subjectId}:${digest.slice(0, 24)}`;
}

export async function synthesisSourceExists(key: string): Promise<boolean> {
  return (await findSourcesByImportKeys([key])).length > 0;
}

export function composeOverviewCard(title: string, draft: OverviewDraft, cards: EvidenceCard[]): OverviewCard {
  const cited = new Set(draft.steps.flatMap((step) => step.evidenceBitIds));
  const evidence = cards.filter((card) => cited.has(card.id));
  const evidenceLink = evidence.map((card) => ({
    bitId: card.id,
    snippet: sanitizeUntrustedLine(card.question, SNIPPET_CHARS),
  }));
  const steps = draft.steps.map((step, index) => `${index + 1}. ${step.technique}: ${step.text}`);

  return {
    front: title,
    back: [draft.lead, ...steps].join("\n"),
    example: [`Built from ${evidence.length} cards:`, ...evidenceLink.map((link) => `- ${link.snippet}`)].join("\n"),
    evidenceBitIds: evidence.map((card) => card.id),
    evidenceLink,
  };
}

export async function submitOverview(
  card: OverviewCard,
  subjectId: string,
  importKey: string,
): Promise<SubmitResult> {
  let result: SubmitResult = { status: "already_present" };

  try {
    await getDb().transaction(async (tx) => {
      const [source] = await insertKeyedKnowledgeSources(
        [{ importKey, rawText: `${card.front}\n${card.back}` }],
        subjectId,
        tx,
        { origin: SYNTHESIS_ORIGIN, status: SYNTHESIS_SOURCE_STATUS },
      );

      if (!source) {
        throw new RollbackSubmit();
      }

      const bit = await insertPendingManualItem(
        tx,
        source.id,
        { front: card.front, back: card.back, example: card.example, aiGenerated: true },
        { approvalState: "pending" },
      );

      if ("ok" in bit) {
        throw new RollbackSubmit();
      }

      result = { status: "created", sourceId: source.id, bitId: bit.id };
    });
  } catch (err) {
    if (!(err instanceof RollbackSubmit)) {
      throw err;
    }

    result = { status: "already_present" };
  }

  return result;
}
