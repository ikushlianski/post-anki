import { NonRetriableError } from "inngest";
import { gatherSourceCandidates } from "./source-candidates.js";
import { resolveRetryResearchInput } from "./curriculum-parse.orchestrator.js";
import { researchInputFromMarker, researchMarkerFor } from "./curriculum-research-marker.js";
import {
  clearCurriculumStructure,
  getCurriculumSourceRows,
  insertPendingSources,
} from "./curriculum.repo.js";
import {
  deletePendingSources,
  finishResearchJob,
  replaceSourcesWithResearchMarker,
  touchResearchJob,
} from "./curriculum-research-jobs.repo.js";

export async function prepareResearchStep(
  curriculumId: string,
  retry: boolean,
  ownerToken?: string,
): Promise<void> {
  if (retry) {
    const input = await resolveRetryResearchInput(curriculumId);

    await clearCurriculumStructure(curriculumId);
    await replaceSourcesWithResearchMarker(curriculumId, researchMarkerFor(input));
  }

  if (!(await touchResearchJob(curriculumId, ownerToken))) {
    throw new NonRetriableError("curriculum not found for research");
  }
}

export async function gatherResearchStep(curriculumId: string): Promise<{ candidates: number }> {
  const rows = await getCurriculumSourceRows(curriculumId);
  const marker = rows.find((row) => row.kind === "web_research" && !row.mergedFromCurriculumId);

  if (!marker) {
    throw new NonRetriableError("research marker missing");
  }

  await deletePendingSources(curriculumId);

  const candidates = await gatherSourceCandidates(researchInputFromMarker(marker), { curriculumId });

  await insertPendingSources(
    curriculumId,
    candidates.map((c) => ({
      kind: c.kind,
      url: c.url,
      title: c.title,
      fetchedText: c.fetchedText,
      discoveryTier: c.discoveryTier,
    })),
  );

  return { candidates: candidates.length };
}

export async function finalizeResearchStep(curriculumId: string, ownerToken?: string): Promise<void> {
  await finishResearchJob(curriculumId, ownerToken);
}
