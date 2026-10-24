import { log } from "../shared/log.js";
import { LlmBudgetExceededError } from "../shared/spend-guard.js";
import { COMMON_SUBJECT_NAME } from "../subject/subject-leaf.js";
import { closestToCentroid, leaderCluster } from "./subject-suggestion-clustering.js";
import type { ScanContext } from "./subject-suggestion-scan.types.js";
import { sanitizeProposedName, sanitizeReason, toEvidenceSample } from "./subject-suggestion-text.js";
import { normalizeSubjectName } from "./subject-suggestion.keys.js";
import {
  SUBJECT_SUGGESTION_CLUSTER_JOIN_SIMILARITY,
  SUBJECT_SUGGESTION_MAX_CALLS_PER_RUN,
  SUBJECT_SUGGESTION_MAX_DEPTH,
  SUBJECT_SUGGESTION_MAX_EVIDENCE_IDS,
  SUBJECT_SUGGESTION_MAX_EVIDENCE_SAMPLES,
  SUBJECT_SUGGESTION_MAX_MODULES,
  SUBJECT_SUGGESTION_MAX_PENDING_PER_PARENT,
  SUBJECT_SUGGESTION_MAX_POOL_BITS,
  SUBJECT_SUGGESTION_MIN_CLUSTER_SIZE,
  SUBJECT_SUGGESTION_MIN_MODULES,
  SUBJECT_SUGGESTION_MIN_POOL_FOR_SUB_SUBJECTS,
} from "./subject-suggestion.config.js";

const GRADER_SAMPLE_BITS = 5;

function depthOf(subjectId: string, parentById: Map<string, string | null>): number {
  let depth = 1;
  let current = parentById.get(subjectId) ?? null;
  const seen = new Set<string>([subjectId]);

  while (current !== null && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    current = parentById.get(current) ?? null;
  }

  return depth;
}

export async function suggestSubSubjects(
  ctx: ScanContext,
  bitCounts: Map<string, number>,
): Promise<void> {
  const parentById = new Map(ctx.subjects.map((s) => [s.id, s.parentId]));
  const childrenByParent = new Map<string, typeof ctx.subjects>();

  for (const subject of ctx.subjects) {
    if (subject.parentId !== null) {
      childrenByParent.set(subject.parentId, [...(childrenByParent.get(subject.parentId) ?? []), subject]);
    }
  }

  const candidates = ctx.subjects
    .filter(
      (subject) =>
        depthOf(subject.id, parentById) < SUBJECT_SUGGESTION_MAX_DEPTH &&
        !(subject.parentId !== null && subject.name === COMMON_SUBJECT_NAME),
    )
    .flatMap((subject) => {
      const children = childrenByParent.get(subject.id) ?? [];
      const poolSubjectId =
        children.length === 0
          ? subject.id
          : children.find((child) => child.name === COMMON_SUBJECT_NAME)?.id;
      const poolSize = poolSubjectId ? (bitCounts.get(poolSubjectId) ?? 0) : 0;

      return poolSubjectId && poolSize >= SUBJECT_SUGGESTION_MIN_POOL_FOR_SUB_SUBJECTS
        ? [{ subject, children, poolSubjectId, poolSize }]
        : [];
    })
    .sort((a, b) => b.poolSize - a.poolSize);

  for (const { subject, children, poolSubjectId } of candidates) {
    if (ctx.state.calls >= SUBJECT_SUGGESTION_MAX_CALLS_PER_RUN) {
      return;
    }

    const room =
      SUBJECT_SUGGESTION_MAX_PENDING_PER_PARENT - (await ctx.deps.store.countPending("sub-subject", subject.id));

    if (room <= 0) {
      continue;
    }

    const bits = await ctx.deps.evidence.listBitsForSubject(poolSubjectId, SUBJECT_SUGGESTION_MAX_POOL_BITS);
    const clusters = leaderCluster(bits, SUBJECT_SUGGESTION_CLUSTER_JOIN_SIMILARITY)
      .filter((cluster) => cluster.members.length >= SUBJECT_SUGGESTION_MIN_CLUSTER_SIZE)
      .sort((a, b) => b.members.length - a.members.length)
      .slice(0, SUBJECT_SUGGESTION_MAX_MODULES);

    if (clusters.length < SUBJECT_SUGGESTION_MIN_MODULES) {
      continue;
    }

    ctx.state.calls += 1;

    let grade;

    try {
      grade = await ctx.deps.grader.gradeSubSubjects({
        parentName: subject.name,
        existingChildNames: children.map((child) => child.name),
        clusters: clusters.map((cluster) => ({
          sampleBits: closestToCentroid(cluster, GRADER_SAMPLE_BITS).map((bit) => bit.body),
        })),
      });
    } catch (err) {
      if (err instanceof LlmBudgetExceededError) {
        throw err;
      }

      log.warn({ err, subjectId: subject.id }, "subject_suggestion_sub_subject_grade_failed");
      ctx.state.skipped += 1;
      continue;
    }

    const usedClusters = new Set<number>();
    const usedNames = new Set(children.map((child) => normalizeSubjectName(child.name)));
    const modules = grade.modules.flatMap((module) => {
      const name = sanitizeProposedName(module.name);
      const cluster = clusters[module.clusterIndex];

      if (!name || !cluster || usedClusters.has(module.clusterIndex)) {
        return [];
      }

      usedClusters.add(module.clusterIndex);

      return [{ name, reason: module.reason, cluster }];
    });

    if (modules.length < SUBJECT_SUGGESTION_MIN_MODULES) {
      ctx.state.skipped += modules.length;
      continue;
    }

    let remaining = room;

    for (const module of modules.slice(0, SUBJECT_SUGGESTION_MAX_MODULES)) {
      const key = normalizeSubjectName(module.name);

      if (remaining <= 0 || usedNames.has(key)) {
        ctx.state.skipped += 1;
        continue;
      }

      usedNames.add(key);

      const evidenceBits = closestToCentroid(module.cluster, SUBJECT_SUGGESTION_MAX_EVIDENCE_IDS);
      const inserted = await ctx.deps.store.insertSuggestionIfNew({
        kind: "sub-subject",
        parentSubjectId: subject.id,
        proposedName: module.name,
        reason: sanitizeReason(module.reason),
        evidenceIds: evidenceBits.map((bit) => bit.id),
        evidenceSamples: evidenceBits
          .slice(0, SUBJECT_SUGGESTION_MAX_EVIDENCE_SAMPLES)
          .map((bit) => toEvidenceSample(bit.body)),
        evidenceCount: module.cluster.members.length,
      });

      if (inserted) {
        ctx.state.created += 1;
        remaining -= 1;
      } else {
        ctx.state.skipped += 1;
      }
    }
  }
}
