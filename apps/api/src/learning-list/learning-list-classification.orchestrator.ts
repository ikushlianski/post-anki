import {
  deriveSeriesVerdict,
  isSafeSourceUrl,
  planQuestionCeiling,
  recommendDestination,
} from "@post-anki/core";
import {
  concernSchema,
  learningListClassificationSchema,
  type CaptureLearningListItemInput,
  type Concern,
  type LearningListDestination,
  type LearningListItem,
  type LearningListItemStatus,
  type LearningListRecommendation,
} from "@post-anki/shared";
import { findCurriculumMappedToNode } from "../curriculum-domain-mapping/curriculum-domain-mapping.repo.js";
import { AGENT_KEYS, getMastra } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { buildClassificationPrompt } from "./learning-list-prompt.js";
import {
  resolveLearningListSource,
  type LearningListSourceError,
} from "./learning-list-source.js";
import { validateTaxonomyProposal } from "./validate-taxonomy-proposal.js";
import {
  insertLearningListItem,
  insertSiblingLearningListItems,
  listAreaPlacementCandidates,
  markLearningListItemUnreachable,
  saveClassification,
} from "./learning-list.repo.js";

const MAX_CAPTURED_SIBLINGS = 12;

export type CaptureLearningListItemError = LearningListSourceError;

export interface CaptureLearningListItemFailure {
  error: CaptureLearningListItemError;
  message: string;
  itemId: string | null;
}

export async function captureLearningListItem(
  input: CaptureLearningListItemInput,
): Promise<LearningListItem | CaptureLearningListItemFailure> {
  const source = await resolveLearningListSource({
    kind: input.kind,
    url: input.url,
    pastedDescription: input.pastedDescription,
  });

  if (!source.ok && source.error === "video_requires_description") {
    return { error: source.error, message: source.message, itemId: null };
  }

  const item = await insertLearningListItem({
    url: input.url,
    rawText: input.kind === "video" ? input.pastedDescription : null,
    title: null,
    kind: input.kind,
  });

  if (!source.ok) {
    await markLearningListItemUnreachable(item.id);

    return { error: source.error, message: source.message, itemId: item.id };
  }

  return classifyCapturedItem(item, input, source.text);
}

async function classifyCapturedItem(
  item: LearningListItem,
  input: CaptureLearningListItemInput,
  sourceText: string,
): Promise<LearningListItem> {
  const candidates = await listAreaPlacementCandidates(input.subjectId);
  const agent = getMastra().getAgent(AGENT_KEYS.learningListClassifier);

  const result = await agent.generate(
    buildClassificationPrompt(candidates, input.kind === "video" ? null : input.url, sourceText),
    { structuredOutput: { schema: learningListClassificationSchema } },
  );

  if (!result.object) {
    throw new Error("learning-list classifier returned no structured output");
  }

  const classification = learningListClassificationSchema.parse(result.object);
  const placement = validateTaxonomyProposal({
    candidates,
    pinnedSubSubjectNodeId: input.subSubjectNodeId,
    proposedSubSubjectName: classification.proposedSubSubjectName,
    proposedAreaName: classification.proposedAreaName,
  });

  const seriesVerdict = deriveSeriesVerdict(classification.signals);
  const existingCurriculumMatch =
    seriesVerdict.verdict === "series" && placement.areaId !== null
      ? await findCurriculumMappedToNode(placement.areaId)
      : null;
  const destination = withPlacementFallback(
    recommendDestination(
      seriesVerdict.verdict,
      placement.areaId === null ? null : { areaId: placement.areaId, areaName: placement.areaName ?? "" },
      existingCurriculumMatch,
    ),
    placement.areaId,
  );

  const recommendation: LearningListRecommendation = {
    verdict: seriesVerdict.verdict,
    reasons: seriesVerdict.reasons,
    destination,
    areaId: placement.areaId,
    areaName: placement.areaName,
    subSubjectNodeId: placement.subSubjectNodeId,
    subjectId: input.subjectId,
    concern: validConcern(classification.suggestedConcern),
    partCount: classification.partCount,
    existingCurriculumMatch,
  };

  const saved = await saveClassification(item.id, {
    title: classification.title.trim().length > 0 ? classification.title.trim() : null,
    rawText: sourceText,
    verdict: seriesVerdict.verdict,
    recommendation,
    questionCeiling: planQuestionCeiling(seriesVerdict.verdict, classification.partCount),
    status: statusForDestination(destination),
  });

  if (seriesVerdict.verdict === "series") {
    await insertSiblingLearningListItems(
      safeSiblingUrls(classification.siblingUrls, input.url),
    );
  }

  log.info(
    {
      itemId: item.id,
      verdict: seriesVerdict.verdict,
      destination,
      areaId: placement.areaId,
    },
    "learning_list_item_classified",
  );

  return saved ?? item;
}

function withPlacementFallback(
  destination: LearningListDestination,
  areaId: string | null,
): LearningListDestination {
  return destination === "fold_in" && areaId === null ? "park" : destination;
}

function statusForDestination(destination: LearningListDestination): LearningListItemStatus {
  if (destination === "fold_in") {
    return "folded_in";
  }

  if (destination === "mini_course" || destination === "extend_curriculum") {
    return "classified";
  }

  return "parked";
}

function validConcern(suggested: string | null): Concern | null {
  if (suggested === null) {
    return null;
  }

  const parsed = concernSchema.safeParse(suggested.trim().toLowerCase());

  return parsed.success ? parsed.data : null;
}

function safeSiblingUrls(urls: string[], capturedUrl: string): string[] {
  const seen = new Set<string>([capturedUrl]);
  const safe: string[] = [];

  for (const url of urls) {
    if (safe.length >= MAX_CAPTURED_SIBLINGS) {
      break;
    }

    if (seen.has(url) || !isSafeSourceUrl(url).allowed) {
      continue;
    }

    seen.add(url);
    safe.push(url);
  }

  return safe;
}
