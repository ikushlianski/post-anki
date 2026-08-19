import type { ModelTier } from "@post-anki/shared";
import { getGlobalModelTier } from "../admin-settings/admin-settings.repo.js";
import { getSubjectModelTier } from "../subject/subject.repo.js";
import { getCurriculumModelTierScope } from "../curriculum/curriculum.repo.js";
import { resolveModelTier } from "./model-tier.js";

export interface ResolveEffectiveModelTierScope {
  subjectId?: string;
  curriculumId?: string;
}

// cost-tier-model-selection — the ONE place every Mastra agent and both
// grounding modules (tech-research-grounding.ts, probe-grounding.ts) go
// through to turn a subject/curriculum scope into an effective tier. A
// curriculumId implies its own subjectId, so passing curriculumId alone is
// enough to cascade through both levels; a bare subjectId (no curriculum
// context yet) only cascades subject -> global; no scope at all resolves to
// the global default, exactly like a scope-less agent (mentor, decide, ...).
export async function resolveEffectiveModelTier(
  scope: ResolveEffectiveModelTierScope,
): Promise<ModelTier> {
  if (scope.curriculumId) {
    // getCurriculumModelTierScope must resolve first — it's what tells us
    // which subject to look up next — but it has no dependency on the
    // global tier, so those two run concurrently rather than sequentially.
    const [globalModelTier, curriculumScope] = await Promise.all([
      getGlobalModelTier(),
      getCurriculumModelTierScope(scope.curriculumId),
    ]);

    if (curriculumScope) {
      const subjectModelTier = await getSubjectModelTier(curriculumScope.subjectId);

      return resolveModelTier({
        curriculumModelTier: curriculumScope.curriculumModelTier,
        subjectModelTier,
        globalModelTier,
      });
    }

    return globalModelTier;
  }

  if (scope.subjectId) {
    const [globalModelTier, subjectModelTier] = await Promise.all([
      getGlobalModelTier(),
      getSubjectModelTier(scope.subjectId),
    ]);

    return resolveModelTier({
      curriculumModelTier: null,
      subjectModelTier,
      globalModelTier,
    });
  }

  return getGlobalModelTier();
}
