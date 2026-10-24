import type { SourceDraft } from "@post-anki/shared";
import { RequestContext } from "@mastra/core/request-context";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { generateWithRetry } from "../mastra/generate-with-retry.js";
import { log } from "../shared/log.js";
import { curriculumMergePlanSchema } from "./curriculum-plan.js";
import { buildMergePrompt } from "./curriculum-prompt.js";
import { filterOutLockedModules, partitionModulesForMerge } from "./curriculum-rules.js";
import { listTags } from "../tag/tag.repo.js";
import { assembleAllSourceText } from "./source-text.js";
import {
  addCurriculumSources,
  countModules,
  deleteModules,
  getCurriculumPromptContext,
  getModuleProgressSnapshots,
  saveCurriculumPlan,
  setCurriculumStatus,
} from "./curriculum.repo.js";

// The model call, the module rewrite and the final status in one pass; not safe to repeat piecemeal.
export async function mergeSynthesizeOrThrow(curriculumId: string): Promise<number> {
  const snapshots = await getModuleProgressSnapshots(curriculumId);
  const { lockedModules, freeModuleIds } = partitionModulesForMerge(snapshots);

  const sourceText = await assembleAllSourceText(curriculumId);
  const ctx = await getCurriculumPromptContext(curriculumId);

  if (!ctx) {
    throw new Error("curriculum not found for merge");
  }

  const existingTags = (await listTags()).map((t) => t.name);
  const agent = getMastra().getAgent(AGENT_KEYS.curriculumArchitect);
  const prompt = buildMergePrompt(
    ctx,
    lockedModules.map((m) => ({
      title: m.title,
      topics: m.topics.map((t) => t.title),
    })),
    sourceText,
    existingTags,
  );

  const result = await generateWithRetry(
    "curriculum_merge",
    curriculumId,
    AGENT_KEYS.curriculumArchitect,
    () =>
      agent.generate(prompt, {
        structuredOutput: { schema: curriculumMergePlanSchema },
        requestContext: new RequestContext([["curriculumId", curriculumId]]),
      }),
  );

  const fresh = result.object
    ? filterOutLockedModules(
        result.object.modules,
        lockedModules.map((m) => m.title),
      )
    : [];

  if (fresh.length > 0) {
    await deleteModules(freeModuleIds);

    const offset = await countModules(curriculumId);

    await saveCurriculumPlan(curriculumId, { modules: fresh }, offset);
  }

  await setCurriculumStatus(curriculumId, "ready");

  log.info(
    {
      curriculumId,
      locked: lockedModules.length,
      rebuilt: freeModuleIds.length,
      produced: fresh.length,
    },
    "curriculum_sources_merged",
  );

  return fresh.length;
}

export async function mergeSynthesize(curriculumId: string): Promise<void> {
  try {
    await mergeSynthesizeOrThrow(curriculumId);
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_merge_failed");
    await setCurriculumStatus(curriculumId, "failed");
  }
}

export async function mergeSourcesIntoCurriculum(
  curriculumId: string,
  newDrafts: SourceDraft[],
): Promise<void> {
  try {
    await addCurriculumSources(curriculumId, newDrafts);
    await setCurriculumStatus(curriculumId, "curating");
    await mergeSynthesizeOrThrow(curriculumId);
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_merge_failed");
    await setCurriculumStatus(curriculumId, "failed");
  }
}
