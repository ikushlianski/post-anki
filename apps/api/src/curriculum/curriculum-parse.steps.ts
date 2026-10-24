import { NonRetriableError } from "inngest";
import {
  parseCurriculumOrThrow,
} from "./curriculum-parse.orchestrator.js";
import { mergeSynthesizeOrThrow } from "./curriculum-merge.orchestrator.js";
import { clearCurriculumStructure } from "./curriculum.repo.js";
import { clearResearchJobTouch, touchResearchJob } from "./curriculum-research-jobs.repo.js";

export type ParseMode = "parse" | "reparse" | "merge";

export async function prepareParseStep(
  curriculumId: string,
  mode: ParseMode,
  ownerToken?: string,
): Promise<void> {
  if (!(await touchResearchJob(curriculumId, ownerToken))) {
    throw new NonRetriableError("curriculum not found for parse");
  }

  if (mode === "reparse") {
    await clearCurriculumStructure(curriculumId);
  }
}

// Model call, save and status change in one step; on failure the touch stays so onFailure or the sweep can fail the course.
export async function synthesizeParseStep(
  curriculumId: string,
  mode: ParseMode,
  ownerToken?: string,
): Promise<{ modules: number }> {
  const modules =
    mode === "merge" ? await mergeSynthesizeOrThrow(curriculumId) : await parseCurriculumOrThrow(curriculumId);

  await clearResearchJobTouch(curriculumId, ownerToken);

  return { modules };
}
