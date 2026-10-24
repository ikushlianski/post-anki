import { compileLecture } from "../lecture/lecture.orchestrator.js";
import { generateStudyMaterial } from "../study-material/study-material.orchestrator.js";
import { generateKnowledgeBitVariants } from "../knowledge-bit/knowledge-bit-generate-variants.orchestrator.js";
import { getKnowledgeSourceRawText } from "../knowledge-bit/knowledge-bit.repo.js";
import { runArticleSummary } from "../mastra/article-summary.agent.js";
import { updateKnowledgeSourceSummary } from "../knowledge-source/knowledge-source.repo.js";
import { mergeSourcesIntoCurriculum } from "../curriculum/curriculum-merge.orchestrator.js";
import { getSessionRow } from "../probe-session/probe-session.repo.js";
import { maybeReplenish } from "../probe-session/probe-session.service.js";
import type { BackgroundJob } from "./background-job.events.js";

async function summarizeStoredSource(sourceId: string): Promise<void> {
  const text = await getKnowledgeSourceRawText(sourceId);

  if (!text) {
    return;
  }

  await updateKnowledgeSourceSummary(sourceId, await runArticleSummary(text));
}

async function replenishStoredSession(
  sessionId: string,
  progress: { total: number; answered: number; correct: number },
): Promise<void> {
  const session = await getSessionRow(sessionId);

  if (session) {
    await maybeReplenish(session, progress);
  }
}

export async function runBackgroundJob(job: BackgroundJob): Promise<void> {
  switch (job.kind) {
    case "lecture-compile":
      await compileLecture(job.topicId);
      return;
    case "study-material":
      await generateStudyMaterial(job.materialId, job.topicId, job.materialKind);
      return;
    case "knowledge-bit-variants":
      await generateKnowledgeBitVariants(job.bitId);
      return;
    case "article-summary":
      await summarizeStoredSource(job.sourceId);
      return;
    case "probe-replenish":
      await replenishStoredSession(job.sessionId, job.progress);
      return;
    case "learning-list-merge":
      await mergeSourcesIntoCurriculum(job.curriculumId, job.drafts);
      return;
  }
}
