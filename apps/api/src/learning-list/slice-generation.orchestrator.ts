import { eq, sql } from "drizzle-orm";
import { RequestContext } from "@mastra/core/request-context";
import {
  deriveModuleFillStates,
  extractSourceText,
  truncateSliceGeneration,
  unfilledModulesInFillOrder,
  type ModuleFillState,
} from "@post-anki/core";
import {
  getCurriculumSourceRows,
  maxModuleOrder,
  storeFetchedText,
  type SourceRow,
} from "../curriculum/curriculum.repo.js";
import { assembleAllSourceText } from "../curriculum/source-text.js";
import { getDb } from "../db/client.js";
import { gaps, learningListItems, modules, topics } from "../db/schema.js";
import { AGENT_KEYS, getMastra } from "../mastra/mastra.js";
import { FETCH_TIMEOUT_MS, guardedFetchText } from "../shared/guarded-fetch.js";
import { newId } from "../shared/id.js";
import { log } from "../shared/log.js";
import { advanceIngestionCursor } from "./learning-list.repo.js";
import { sliceGenerationPlanSchema, type SliceGenerationPlan } from "./slice-generation-plan.js";
import { buildSliceGenerationPrompt } from "./slice-generation-prompt.js";

export interface ReleasedSlice {
  itemId: string;
  topicIds: string[];
  questionsGenerated: number;
}

export interface SliceGenerationRequest {
  curriculumId: string;
  topicCount: number;
  questionCount: number;
}

interface ModuleWithFillState extends ModuleFillState {
  title: string;
}

// null moduleId/sourceId means the legacy all-source-text path (a fresh
// "Slice N" module gets created for it).
interface GenerationTarget {
  moduleId: string | null;
  sourceId: string | null;
  sourceText: string;
}

const MAX_PART_TEXT_CHARS = 20_000;
const CONTROL_CHARS_EXCEPT_WHITESPACE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g",
);

function sanitize(text: string): string {
  return text.replace(CONTROL_CHARS_EXCEPT_WHITESPACE, " ").trim();
}

// A failed fetch is left UNcached — never a placeholder string the way
// source-fetch.ts's resolveSourceText does — so the next release retries
// the real document instead of treating a dead link as the chapter itself.
async function fetchPartText(source: SourceRow): Promise<string | null> {
  if (source.fetchedText && source.fetchedText.trim().length > 0) {
    return source.fetchedText;
  }

  const fetched = await guardedFetchText(source.value, { timeoutMs: FETCH_TIMEOUT_MS });

  if (!fetched.ok) {
    return null;
  }

  const text = sanitize(extractSourceText(fetched.text)).slice(0, MAX_PART_TEXT_CHARS);

  if (text.length === 0) {
    return null;
  }

  await storeFetchedText(source.id, text);

  return text;
}

// Walks the unfilled-module queue in book order, skipping any part whose
// document can't be fetched — one dead link costs one skipped candidate,
// never the whole release. Sequential on purpose: stop at the first hit.
async function selectFillableKnownPart(
  unfilled: ModuleWithFillState[],
  sourceRows: SourceRow[],
): Promise<GenerationTarget | null> {
  const sourceByTitle = new Map(sourceRows.map((row) => [row.title, row]));

  for (const candidate of unfilled) {
    const source = sourceByTitle.get(candidate.title);

    if (!source) {
      continue;
    }

    const sourceText = await fetchPartText(source);

    if (sourceText) {
      return { moduleId: candidate.id, sourceId: source.id, sourceText };
    }
  }

  return null;
}

// No open transaction here — the LLM call can take seconds. writeGeneratedSlice
// is a second, short, separately locked transaction that re-checks fresh
// state, so a race can only ever under-write.
export async function generateSliceContent(
  itemId: string,
  request: SliceGenerationRequest,
  now: string,
): Promise<ReleasedSlice | null> {
  const db = getDb();
  const [moduleRows, topicRows, sourceRows] = await Promise.all([
    db.select({ id: modules.id, order: modules.order, title: modules.title }).from(modules).where(eq(modules.curriculumId, request.curriculumId)),
    db.select({ title: topics.title, moduleId: topics.moduleId }).from(topics).where(eq(topics.curriculumId, request.curriculumId)),
    getCurriculumSourceRows(request.curriculumId),
  ]);

  const alreadyCoveredTitles = topicRows.map((row) => row.title);
  const moduleFillStates = deriveModuleFillStates(moduleRows, topicRows.map((row) => row.moduleId));
  const unfilled = unfilledModulesInFillOrder(moduleFillStates) as ModuleWithFillState[];

  // Never falls back to all-source-text once a course has known parts —
  // that would break its book shape. Null means nothing releases this round.
  if (unfilled.length > 0) {
    const target = await selectFillableKnownPart(unfilled, sourceRows);

    if (target === null) {
      log.warn(
        { itemId, curriculumId: request.curriculumId },
        "learning_list_slice_generation_no_fetchable_part",
      );

      return null;
    }

    return generateFromTarget(itemId, request, alreadyCoveredTitles, target, now);
  }

  const sourceText = await assembleAllSourceText(request.curriculumId);

  if (sourceText.trim().length === 0) {
    log.warn(
      { itemId, curriculumId: request.curriculumId },
      "learning_list_slice_generation_no_source_text",
    );

    return null;
  }

  return generateFromTarget(
    itemId,
    request,
    alreadyCoveredTitles,
    { moduleId: null, sourceId: sourceRows[0]?.id ?? null, sourceText },
    now,
  );
}

async function generateFromTarget(
  itemId: string,
  request: SliceGenerationRequest,
  alreadyCoveredTitles: string[],
  target: GenerationTarget,
  now: string,
): Promise<ReleasedSlice | null> {
  const prompt = buildSliceGenerationPrompt({
    alreadyCoveredTitles,
    topicCount: request.topicCount,
    sourceText: target.sourceText,
  });

  let result: { object?: SliceGenerationPlan };

  try {
    const agent = getMastra().getAgent(AGENT_KEYS.learningListSlice);

    result = await agent.generate(prompt, {
      structuredOutput: { schema: sliceGenerationPlanSchema },
      requestContext: new RequestContext([["curriculumId", request.curriculumId]]),
    });
  } catch (err) {
    log.error(
      { err, itemId, curriculumId: request.curriculumId },
      "learning_list_slice_generation_failed",
    );

    return null;
  }

  if (!result.object) {
    log.warn(
      { itemId, curriculumId: request.curriculumId },
      "learning_list_slice_generation_empty",
    );

    return null;
  }

  const candidateTopics = truncateSliceGeneration(
    result.object.topics,
    request.topicCount,
    request.questionCount,
  );

  if (candidateTopics.length === 0) {
    return null;
  }

  return writeGeneratedSlice(itemId, request, candidateTopics, target.sourceId, target.moduleId, now);
}

async function writeGeneratedSlice(
  itemId: string,
  request: SliceGenerationRequest,
  candidateTopics: ReturnType<typeof truncateSliceGeneration>,
  sourceId: string | null,
  targetModuleId: string | null,
  now: string,
): Promise<ReleasedSlice | null> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${itemId})::bigint)`);

    const item = (
      await tx.select().from(learningListItems).where(eq(learningListItems.id, itemId)).limit(1)
    )[0];

    if (!item || item.curriculumId === null || item.questionCeiling === null) {
      return null;
    }

    const remaining = item.questionCeiling - item.questionsGenerated;

    if (remaining <= 0) {
      return null;
    }

    const finalTopics = truncateSliceGeneration(
      candidateTopics,
      request.topicCount,
      Math.min(request.questionCount, remaining),
    );

    if (finalTopics.length === 0) {
      return null;
    }

    // Fresh "Slice N" module for the legacy path; for a known-parts target,
    // re-check under the now-held lock that nothing filled it since the
    // pre-transaction read (a race with a concurrent release for this item).
    let moduleId: string;

    if (targetModuleId === null) {
      const order = (await maxModuleOrder(item.curriculumId)) + 1;

      moduleId = newId("mod");
      await tx.insert(modules).values({ id: moduleId, curriculumId: item.curriculumId, title: `Slice ${order}`, order });
    } else {
      const alreadyFilled = (
        await tx.select({ id: topics.id }).from(topics).where(eq(topics.moduleId, targetModuleId)).limit(1)
      )[0];

      if (alreadyFilled) {
        return null;
      }

      moduleId = targetModuleId;
    }

    const topicIds: string[] = [];
    let questionsInserted = 0;

    for (const [index, candidate] of finalTopics.entries()) {
      const topicId = newId("top");

      await tx.insert(topics).values({
        id: topicId,
        moduleId,
        curriculumId: item.curriculumId,
        title: candidate.title,
        summary: candidate.summary,
        order: index + 1,
        included: true,
        sourceId,
      });

      topicIds.push(topicId);

      if (candidate.gaps.length > 0) {
        await tx.insert(gaps).values(
          candidate.gaps.map((gap) => ({
            id: newId("gap"),
            topicId,
            label: gap.label,
            depth: gap.depth,
            origin: "ai" as const,
            state: "open" as const,
            wanted: false,
            concern: null,
          })),
        );

        questionsInserted += candidate.gaps.length;
      }
    }

    await advanceIngestionCursor(itemId, item.questionsGenerated + questionsInserted, now, tx);

    log.info(
      {
        itemId,
        curriculumId: item.curriculumId,
        moduleId,
        topics: topicIds.length,
        questions: questionsInserted,
      },
      "learning_list_slice_generated",
    );

    return { itemId, topicIds, questionsGenerated: questionsInserted };
  });
}
