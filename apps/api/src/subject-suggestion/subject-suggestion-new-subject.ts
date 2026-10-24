import { cosineSimilarity } from "@post-anki/core";
import { log } from "../shared/log.js";
import { LlmBudgetExceededError } from "../shared/spend-guard.js";
import { closestToCentroid, leaderCluster } from "./subject-suggestion-clustering.js";
import type { EvidenceBit } from "./subject-suggestion-evidence.repo.js";
import type { ScanContext } from "./subject-suggestion-scan.types.js";
import { sanitizeProposedName, sanitizeReason, toEvidenceSample } from "./subject-suggestion-text.js";
import { normalizeSubjectName } from "./subject-suggestion.keys.js";
import {
  SUBJECT_SUGGESTION_CLUSTER_JOIN_SIMILARITY,
  SUBJECT_SUGGESTION_MAX_CALLS_PER_RUN,
  SUBJECT_SUGGESTION_MAX_CREATED_PER_RUN,
  SUBJECT_SUGGESTION_MAX_EVIDENCE_IDS,
  SUBJECT_SUGGESTION_MAX_EVIDENCE_SAMPLES,
  SUBJECT_SUGGESTION_MAX_PENDING_NEW_SUBJECT,
  SUBJECT_SUGGESTION_MAX_SUBJECT_SIMILARITY,
  SUBJECT_SUGGESTION_MIN_CLUSTER_SIZE,
  SUBJECT_SUGGESTION_MIN_UNPLACED_BITS,
  SUBJECT_SUGGESTION_NEAREST_SUBJECTS_SHOWN,
} from "./subject-suggestion.config.js";

const GRADER_SAMPLE_BITS = 6;

function rankSubjectsBySimilarity(
  ctx: ScanContext,
  embeddings: Map<string, number[]>,
  centroid: number[],
): { name: string; similarity: number }[] {
  return ctx.subjects
    .flatMap((subject) => {
      const embedding = embeddings.get(subject.id);

      return embedding && embedding.length === centroid.length
        ? [{ name: subject.name, similarity: cosineSimilarity(centroid, embedding) }]
        : [];
    })
    .sort((a, b) => b.similarity - a.similarity);
}

export async function suggestNewSubjects(
  ctx: ScanContext,
  unplaced: EvidenceBit[],
  subjectEmbeddings: Map<string, number[]>,
): Promise<void> {
  if (unplaced.length < SUBJECT_SUGGESTION_MIN_UNPLACED_BITS) {
    return;
  }

  const clusters = leaderCluster(unplaced, SUBJECT_SUGGESTION_CLUSTER_JOIN_SIMILARITY)
    .filter((cluster) => cluster.members.length >= SUBJECT_SUGGESTION_MIN_CLUSTER_SIZE)
    .sort((a, b) => b.members.length - a.members.length);

  const topLevelNames = new Set(
    ctx.subjects.filter((s) => s.parentId === null).map((s) => normalizeSubjectName(s.name)),
  );

  const similarities: number[] = [];

  for (const cluster of clusters) {
    const ranked = rankSubjectsBySimilarity(ctx, subjectEmbeddings, cluster.centroid);
    const best = ranked[0]?.similarity ?? 0;

    similarities.push(Number(best.toFixed(2)));

    if (best >= SUBJECT_SUGGESTION_MAX_SUBJECT_SIMILARITY) {
      continue;
    }

    const pending = await ctx.deps.store.countPending("new-subject");

    if (
      pending + ctx.state.created >= SUBJECT_SUGGESTION_MAX_PENDING_NEW_SUBJECT ||
      ctx.state.created >= SUBJECT_SUGGESTION_MAX_CREATED_PER_RUN ||
      ctx.state.calls >= SUBJECT_SUGGESTION_MAX_CALLS_PER_RUN
    ) {
      break;
    }

    const evidenceBits = closestToCentroid(cluster, SUBJECT_SUGGESTION_MAX_EVIDENCE_IDS);
    const nearest = evidenceBits.slice(0, GRADER_SAMPLE_BITS);

    ctx.state.calls += 1;

    let grade;

    try {
      grade = await ctx.deps.grader.gradeNewSubject({
        sampleBits: nearest.map((bit) => bit.body),
        nearestSubjectNames: ranked.slice(0, SUBJECT_SUGGESTION_NEAREST_SUBJECTS_SHOWN).map((s) => s.name),
      });
    } catch (err) {
      if (err instanceof LlmBudgetExceededError) {
        throw err;
      }

      log.warn({ err }, "subject_suggestion_new_subject_grade_failed");
      ctx.state.skipped += 1;
      continue;
    }

    const name = grade.suggest ? sanitizeProposedName(grade.name) : null;

    if (!name || topLevelNames.has(normalizeSubjectName(name))) {
      ctx.state.skipped += grade.suggest ? 1 : 0;
      continue;
    }

    const inserted = await ctx.deps.store.insertSuggestionIfNew({
      kind: "new-subject",
      parentSubjectId: null,
      proposedName: name,
      reason: sanitizeReason(grade.reason),
      evidenceIds: evidenceBits.map((bit) => bit.id),
      evidenceSamples: evidenceBits
        .slice(0, SUBJECT_SUGGESTION_MAX_EVIDENCE_SAMPLES)
        .map((bit) => toEvidenceSample(bit.body)),
      evidenceCount: cluster.members.length,
    });

    if (inserted) {
      ctx.state.created += 1;
    } else {
      ctx.state.skipped += 1;
    }
  }

  log.info({ clusters: clusters.length, bestSubjectSimilarities: similarities }, "subject_suggestion_similarity_histogram");
}
