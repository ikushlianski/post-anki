import type { TriggerCardSubjectSuggestionScanResult } from "@post-anki/shared";
import { runSubjectCheck } from "../knowledge-source/knowledge-source-subject-check.orchestrator.js";
import { log } from "../shared/log.js";
import { isSubjectAssignmentEnabled } from "../subject-assignment/subject-assignment.config.js";
import { classifyOutcome } from "../subject-assignment/subject-assignment.select.js";
import {
  CARD_SUBJECT_SUGGESTION_BATCH_CARDS,
  CARD_SUBJECT_SUGGESTION_CARD_SAMPLE_COUNT,
  CARD_SUBJECT_SUGGESTION_EXCERPT_CHARS,
  CARD_SUBJECT_SUGGESTION_MAX_CALLS_PER_RUN,
} from "./card-subject-suggestion.config.js";
import {
  insertCardSubjectSuggestions,
  listCardsAwaitingSubject,
  type CardAwaitingSubject,
} from "./card-subject-suggestion.repo.js";

function groupBySource(cards: CardAwaitingSubject[]): Map<string, CardAwaitingSubject[]> {
  const groups = new Map<string, CardAwaitingSubject[]>();

  for (const card of cards) {
    groups.set(card.knowledgeSourceId, [...(groups.get(card.knowledgeSourceId) ?? []), card]);
  }

  return groups;
}

function buildExcerpt(cards: CardAwaitingSubject[]): string {
  return cards
    .slice(0, CARD_SUBJECT_SUGGESTION_CARD_SAMPLE_COUNT)
    .map((card) => card.body.replace(/\s+/g, " ").trim())
    .join(" | ")
    .slice(0, CARD_SUBJECT_SUGGESTION_EXCERPT_CHARS);
}

export async function runCardSubjectSuggestionScan(): Promise<TriggerCardSubjectSuggestionScanResult> {
  const result = { checked: 0, suggested: 0, noMatch: 0, calls: 0 };

  if (!isSubjectAssignmentEnabled()) {
    return result;
  }

  const cards = await listCardsAwaitingSubject(CARD_SUBJECT_SUGGESTION_BATCH_CARDS);

  for (const [sourceId, group] of groupBySource(cards)) {
    if (result.calls >= CARD_SUBJECT_SUGGESTION_MAX_CALLS_PER_RUN) {
      break;
    }

    const excerpt = buildExcerpt(group);

    if (excerpt.length === 0) {
      continue;
    }

    result.calls += 1;

    const outcome = classifyOutcome(await runSubjectCheck({ blocks: [{ type: "text", value: excerpt }] }));

    if (outcome.kind === "stop") {
      log.warn({ calls: result.calls }, "card_subject_suggestion_stopped");
      break;
    }

    if (outcome.kind === "skip") {
      continue;
    }

    const proposal =
      outcome.kind === "proposal" && outcome.proposal.confidence !== "low" ? outcome.proposal : null;

    await insertCardSubjectSuggestions(
      group.map((card) => ({
        knowledgeBitId: card.id,
        knowledgeSourceId: sourceId,
        suggestedSubjectId: proposal?.subjectId ?? null,
        confidence: proposal?.confidence ?? null,
      })),
    );
    result.checked += group.length;

    if (proposal) {
      result.suggested += group.length;
    } else {
      result.noMatch += group.length;
    }
  }

  return result;
}
