import {
  deriveSeriesVerdict,
  isSafeSourceUrl,
  parseGithubBlobUrl,
  planQuestionCeiling,
  recommendDestination,
  type DiscoveredChapter,
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
  type SeriesVerdict,
} from "@post-anki/shared";
import { findCurriculumMappedToNode } from "../curriculum-domain-mapping/curriculum-domain-mapping.repo.js";
import { RequestContext } from "@mastra/core/request-context";
import { AGENT_KEYS, getMastra } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { discoverGithubChapters, type GithubChapterDiscoveryResult } from "./github-chapters.js";
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

const NO_CHAPTERS_DISCOVERED: GithubChapterDiscoveryResult = {
  chapters: [],
  truncated: false,
  capped: false,
};

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

  const [result, chapterDiscovery] = await Promise.all([
    agent.generate(
      buildClassificationPrompt(candidates, input.kind === "video" ? null : input.url, sourceText),
      {
        structuredOutput: { schema: learningListClassificationSchema },
        requestContext: new RequestContext([["subjectId", input.subjectId]]),
      },
    ),
    input.kind === "video" ? Promise.resolve(NO_CHAPTERS_DISCOVERED) : discoverGithubChapters(input.url),
  ]);

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

  const bookChapters = otherBookChapters(chapterDiscovery, input.url);
  const seriesVerdict = bookChapters === null
    ? deriveSeriesVerdict(classification.signals)
    : bookSeriesVerdict(bookChapters, chapterDiscovery);
  const partCount = bookChapters === null ? classification.partCount : bookChapters.length + 1;
  const siblingUrls = bookChapters === null
    ? classification.siblingUrls
    : bookChapters.map((chapter) => chapter.url);
  // Safety-validated once here, then reused for both the persisted
  // recommendation and the un-ingested sibling capture below — never a
  // second, separately-drifting validation pass over the same untrusted,
  // model-read URLs.
  const safeSiblings = safeSiblingUrls(siblingUrls, input.url);
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
  // "Known" — genuinely verified, not an LLM's guess at partCount — only for
  // `mini_course`, the one destination that ever seeds modules from these
  // parts (`seedKnownSeriesModules`, called only from
  // `approveMiniCourseRecommendation`). `extend_curriculum` and `fold_in`
  // never seed known-part modules, so raising their ceiling here would just
  // be unearned generation budget spent into someone else's curriculum.
  const knownPartCount =
    destination === "mini_course" && safeSiblings.length > 0 ? safeSiblings.length + 1 : null;

  const recommendation: LearningListRecommendation = {
    verdict: seriesVerdict.verdict,
    reasons: seriesVerdict.reasons,
    destination,
    areaId: placement.areaId,
    areaName: placement.areaName,
    subSubjectNodeId: placement.subSubjectNodeId,
    subjectId: input.subjectId,
    concern: validConcern(classification.suggestedConcern),
    partCount,
    existingCurriculumMatch,
    siblingUrls: safeSiblings,
  };

  const saved = await saveClassification(item.id, {
    title: classification.title.trim().length > 0 ? classification.title.trim() : null,
    rawText: sourceText,
    verdict: seriesVerdict.verdict,
    recommendation,
    questionCeiling: planQuestionCeiling(seriesVerdict.verdict, partCount, knownPartCount),
    status: statusForDestination(destination),
  });

  if (seriesVerdict.verdict === "series") {
    await insertSiblingLearningListItems(safeSiblings);
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

// Discovered chapters always include whichever chapter the API tree happens
// to sort the captured URL into — this excludes it by repository path
// (decoded, so it matches regardless of how the user's URL was encoded)
// rather than by exact string equality against input.url, since a freshly
// built chapter URL and the URL the user actually pasted can differ in
// encoding even when they name the same file.
function otherBookChapters(
  discovery: GithubChapterDiscoveryResult,
  capturedUrl: string,
): DiscoveredChapter[] | null {
  if (discovery.chapters.length === 0) {
    return null;
  }

  const capturedPath = parseGithubBlobUrl(capturedUrl)?.path ?? null;
  const others = discovery.chapters.filter((chapter) => chapter.path !== capturedPath);

  return others.length > 0 ? others : null;
}

function bookSeriesVerdict(
  otherChapters: DiscoveredChapter[],
  discovery: GithubChapterDiscoveryResult,
): SeriesVerdict {
  const chapterWord = otherChapters.length === 1 ? "chapter" : "chapters";
  const wasWere = otherChapters.length === 1 ? "was" : "were";
  const reasons = [
    `${otherChapters.length} other ${chapterWord} from the same GitHub repository ${wasWere} found`,
  ];

  if (discovery.truncated) {
    reasons.push("the repository's file listing was truncated by GitHub, so some chapters may be missing");
  }

  if (discovery.capped) {
    reasons.push("the repository has more markdown files than could be included, so the chapter list was capped");
  }

  return { verdict: "series", reasons };
}

// learning-list-fold-in — `fold_in` is an approvable recommendation, exactly
// like `mini_course`/`extend_curriculum`: it lands the item on `classified`
// ("awaiting your decision") so `approveRecommendation` can claim and resolve
// it. `folded_in` is the SEPARATE terminal status `linkFoldInCurriculum`
// (learning-list.repo.ts) writes once approval actually happens — this
// function must never pre-empt that by writing it here, or the item is never
// reachable through the approve flow at all.
function statusForDestination(destination: LearningListDestination): LearningListItemStatus {
  if (
    destination === "mini_course" ||
    destination === "extend_curriculum" ||
    destination === "fold_in"
  ) {
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
