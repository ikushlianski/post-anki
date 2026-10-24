import { log } from "../shared/log.js";
import { dispatchBackgroundJob } from "../background-job/background-job.starter.js";
import { runArticleSummary } from "../mastra/article-summary.agent.js";
import { updateKnowledgeSourceSummary } from "./knowledge-source.repo.js";

export function summarizeSourceAfterAdd(sourceId: string, articleText: string): Promise<void> {
  return dispatchBackgroundJob(
    { kind: "article-summary", sourceId },
    async () => updateKnowledgeSourceSummary(sourceId, await runArticleSummary(articleText)),
    (err) => log.error({ err, sourceId }, "article_summary_failed"),
  );
}
