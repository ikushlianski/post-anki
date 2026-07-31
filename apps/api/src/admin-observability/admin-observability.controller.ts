import type http from "node:http";
import type { AdminObservability } from "@post-anki/shared";
import { sendJson } from "../shared/http.js";
import { getStuckCurricula } from "../curriculum/curriculum-health.js";
import { getCurriculumNamesByIds } from "../curriculum/curriculum.repo.js";
import { getRecentLlmCallEvents } from "../llm-call-events/llm-call-events.repo.js";
import { listRecentOntologyMerges } from "../ontology-merge/ontology-merge.repo.js";

export async function handleGetAdminObservability(
  res: http.ServerResponse,
): Promise<void> {
  const [stuckCurricula, recentEvents, recentMerges] = await Promise.all([
    getStuckCurricula(),
    getRecentLlmCallEvents(50),
    listRecentOntologyMerges(50),
  ]);

  const curriculumIds = Array.from(
    new Set(recentEvents.flatMap((e) => (e.curriculumId ? [e.curriculumId] : []))),
  );

  const namesByCurriculumId = await getCurriculumNamesByIds(curriculumIds);

  const body: AdminObservability = {
    stuckCurricula,
    recentEvents: recentEvents.map((e) => ({
      ...e,
      curriculumName: e.curriculumId ? namesByCurriculumId.get(e.curriculumId) ?? null : null,
    })),
    recentMerges,
  };

  sendJson(res, 200, body);
}
