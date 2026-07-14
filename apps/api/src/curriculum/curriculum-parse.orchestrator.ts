import type { SourceDraft } from "@post-anki/shared";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { curriculumPlanSchema, curriculumMergePlanSchema } from "./curriculum-plan.js";
import { buildParsePrompt, buildMergePrompt } from "./curriculum-prompt.js";
import { partitionModulesForMerge, filterOutLockedModules } from "./curriculum-rules.js";
import { resolveSourceText } from "./source-fetch.js";
import {
  addCurriculumSources,
  clearCurriculumStructure,
  countModules,
  deleteModules,
  getCurriculumPromptContext,
  getCurriculumSourceRows,
  getModuleProgressSnapshots,
  saveCurriculumPlan,
  setCurriculumStatus,
  storeFetchedText,
  type SourceRow,
} from "./curriculum.repo.js";

async function resolveAndStore(rows: SourceRow[]): Promise<string> {
  const parts = await Promise.all(
    rows.map(async (row) => {
      const text = await resolveSourceText(row.kind, row.value);

      await storeFetchedText(row.id, text);

      return row.title ? `# ${row.title}\n${text}` : text;
    }),
  );

  return parts.filter((p) => p.trim().length > 0).join("\n\n---\n\n");
}

async function assembleAllSourceText(curriculumId: string): Promise<string> {
  const rows = await getCurriculumSourceRows(curriculumId);

  const parts = await Promise.all(
    rows.map(async (row) => {
      let text = row.fetchedText;

      if (text === null) {
        text = await resolveSourceText(row.kind, row.value);
        await storeFetchedText(row.id, text);
      }

      return row.title ? `# ${row.title}\n${text}` : text;
    }),
  );

  return parts.filter((p) => p.trim().length > 0).join("\n\n---\n\n");
}

export async function parseCurriculum(curriculumId: string): Promise<void> {
  try {
    const ctx = await getCurriculumPromptContext(curriculumId);

    if (!ctx) {
      throw new Error("curriculum not found for parse");
    }

    const rows = await getCurriculumSourceRows(curriculumId);
    const sourceText = await resolveAndStore(rows);
    const agent = getMastra().getAgent(AGENT_KEYS.curriculumArchitect);
    const prompt = buildParsePrompt(ctx, sourceText);

    const result = await agent.generate(prompt, {
      structuredOutput: { schema: curriculumPlanSchema },
    });

    if (!result.object) {
      throw new Error("architect returned no structured plan");
    }

    await saveCurriculumPlan(curriculumId, result.object);
    await setCurriculumStatus(curriculumId, "ready");

    log.info(
      { curriculumId, modules: result.object.modules.length },
      "curriculum_parsed",
    );
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_parse_failed");
    await setCurriculumStatus(curriculumId, "failed");
  }
}

export async function reparseCurriculum(curriculumId: string): Promise<void> {
  try {
    await clearCurriculumStructure(curriculumId);
    await parseCurriculum(curriculumId);
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_reparse_failed");
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

    const snapshots = await getModuleProgressSnapshots(curriculumId);
    const { lockedModules, freeModuleIds } = partitionModulesForMerge(snapshots);

    const sourceText = await assembleAllSourceText(curriculumId);
    const ctx = await getCurriculumPromptContext(curriculumId);

    if (!ctx) {
      throw new Error("curriculum not found for merge");
    }

    const agent = getMastra().getAgent(AGENT_KEYS.curriculumArchitect);
    const prompt = buildMergePrompt(
      ctx,
      lockedModules.map((m) => ({
        title: m.title,
        topics: m.topics.map((t) => t.title),
      })),
      sourceText,
    );

    const result = await agent.generate(prompt, {
      structuredOutput: { schema: curriculumMergePlanSchema },
    });

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
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_merge_failed");
    await setCurriculumStatus(curriculumId, "failed");
  }
}
