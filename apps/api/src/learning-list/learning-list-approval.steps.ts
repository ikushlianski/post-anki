import { eq } from "drizzle-orm";
import {
  planQuestionCeiling,
  planSeriesModules,
  resolveKnownSeriesParts,
  type SeriesPart,
} from "@post-anki/core";
import type { LearningListItem } from "@post-anki/shared";
import { getCurriculumSourceRows } from "../curriculum/curriculum.repo.js";
import { triggerCurriculumDomainMapping } from "../curriculum-domain-mapping/curriculum-domain-mapping.orchestrator.js";
import { getDb } from "../db/client.js";
import { modules, sources } from "../db/schema.js";
import { discoverGithubChapters } from "./github-chapters.js";
import { newId } from "../shared/id.js";
import { log } from "../shared/log.js";
import { setQuestionCeiling } from "./learning-list.repo.js";

export async function suggestDomainMappings(curriculumId: string): Promise<void> {
  try {
    await triggerCurriculumDomainMapping(curriculumId);
  } catch (err) {
    log.error({ err, curriculumId }, "learning_list_domain_mapping_failed");
  }
}

// GitHub's own chapter listing is the one host-specific discoverer wired up
// today (packages/core/src/github-book); planSeriesModules and everything
// downstream only ever see the host-agnostic SeriesPart shape.
async function discoverGithubSeriesParts(url: string): Promise<SeriesPart[]> {
  const discovery = await discoverGithubChapters(url);

  return discovery.chapters.map((chapter) => ({ url: chapter.url, title: chapter.title }));
}

// Shapes the course like the book itself up front: one module per known
// part, in book order, each paired with a `sources` row carrying that
// part's own URL for slice-generation.orchestrator.ts to fill from later.
// The captured item's own source row (`createCurriculum`'s
// `sourcesForItem(claimed)`) is matched by URL and re-titled, not duplicated.
//
// `resolveKnownSeriesParts` (packages/core) prefers a fresh GitHub discovery
// (re-run here, not trusted from classification time) over the sibling URLs
// already safety-validated and persisted on the recommendation. Neither
// present means nothing seeds — generateSliceContent falls back to its
// original all-source-text "Slice N" path. Never throws: a discovery hiccup
// must not fail an approval that already created real content elsewhere.
export async function seedKnownSeriesModules(
  curriculumId: string,
  item: LearningListItem,
): Promise<number> {
  if (item.kind === "video" || !item.url) {
    return 0;
  }

  try {
    const discoveredChapters = await discoverGithubSeriesParts(item.url);
    const parts = resolveKnownSeriesParts({
      discoveredChapters,
      siblingUrls: item.recommendation?.siblingUrls ?? [],
      capturedUrl: item.url,
      capturedTitle: item.title,
    });
    const planned = planSeriesModules(parts);

    if (planned.length <= 1) {
      return 0;
    }

    const existingByUrl = new Map(
      (await getCurriculumSourceRows(curriculumId)).map((source) => [source.value, source]),
    );

    await getDb().transaction(async (tx) => {
      for (const part of planned) {
        const existing = existingByUrl.get(part.url);

        if (existing) {
          await tx.update(sources).set({ title: part.title }).where(eq(sources.id, existing.id));
        } else {
          await tx.insert(sources).values({
            id: newId("src"),
            curriculumId,
            kind: "link",
            value: part.url,
            title: part.title,
          });
        }

        await tx.insert(modules).values({
          id: newId("mod"),
          curriculumId,
          title: part.title,
          order: part.order,
        });
      }
    });

    log.info({ curriculumId, parts: planned.length }, "learning_list_series_modules_seeded");

    return planned.length;
  } catch (err) {
    log.error({ err, curriculumId, itemId: item.id }, "learning_list_series_modules_seed_failed");

    return 0;
  }
}

// The ceiling is planned at classification time, but the modules are seeded
// at approval time from a fresh discovery — a listing that was rate-limited
// or capped at capture can succeed later, and vice versa. Left alone, the
// course would promise N modules while the budget only funded M. The seeded
// count is the one that matches what the learner can actually see, so it
// wins. Never lowers a ceiling: shrinking it after questions were already
// generated would strand content the learner has, and planQuestionCeiling
// only ever raises for known parts anyway.
export async function reconcileCeilingToSeededParts(
  itemId: string,
  item: LearningListItem,
  seededPartCount: number,
): Promise<void> {
  const verdict = item.recommendation?.verdict ?? null;

  if (verdict === null || seededPartCount <= 0) {
    return;
  }

  const reconciled = planQuestionCeiling(
    verdict,
    item.recommendation?.partCount ?? seededPartCount,
    seededPartCount,
  );

  const current = item.questionCeiling ?? 0;

  if (reconciled <= current) {
    return;
  }

  await setQuestionCeiling(itemId, reconciled);

  log.info(
    { itemId, from: current, to: reconciled, seededPartCount },
    "learning_list_question_ceiling_reconciled",
  );
}
