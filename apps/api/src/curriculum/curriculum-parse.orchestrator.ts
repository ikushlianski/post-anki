import type { Level, SourceDraft } from "@post-anki/shared";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { curriculumPlanSchema, curriculumMergePlanSchema } from "./curriculum-plan.js";
import { docResearchPlanSchema } from "./curriculum-research-plan.js";
import { gatherTechResearchGrounding } from "./tech-research-grounding.js";
import { gatherDocLinkGrounding } from "./doc-link-grounding.js";
import { buildParsePrompt, buildMergePrompt, buildResearchPrompt } from "./curriculum-prompt.js";
import {
  partitionModulesForMerge,
  filterOutLockedModules,
  resolveRetryResearchSource,
} from "./curriculum-rules.js";
import { resolveSourceText } from "./source-fetch.js";
import {
  addCurriculumSources,
  clearCurriculumStructure,
  countModules,
  deleteModules,
  deleteResearchSources,
  getCurriculum,
  getCurriculumPromptContext,
  getCurriculumSourceRows,
  getModuleProgressSnapshots,
  insertResearchSource,
  saveCurriculumPlan,
  setCurriculumStatus,
  setCurriculumStrictOrder,
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

export interface ResearchCurriculumInput {
  name: string;
  docUrl?: string | null;
}

export async function researchCurriculum(
  curriculumId: string,
  input: ResearchCurriculumInput,
  preferredLevel?: Level | null,
): Promise<void> {
  try {
    const ctx = await getCurriculumPromptContext(curriculumId);

    const grounding = input.docUrl
      ? await gatherDocLinkGrounding(input.docUrl, input.name)
      : {
          text: (await gatherTechResearchGrounding(input.name)).text,
          kind: "web_research" as const,
          title: `Auto-researched: ${input.name}`,
        };

    // Recorded before the throw-prone synthesis call below: if synthesis
    // fails, this row must already exist so the curriculum still resolves
    // to research-origin and the "Retry research" (not "Re-parse sources")
    // recovery banner renders on the failed curriculum. `value` is always
    // the original docUrl (never the sub-path actually fetched) so a later
    // retry can tell a URL-driven curriculum apart from a legacy one.
    await insertResearchSource(
      curriculumId,
      {
        kind: grounding.kind,
        value: input.docUrl ?? input.name,
        title: grounding.title,
      },
      grounding.text,
    );

    const agent = getMastra().getAgent(AGENT_KEYS.docResearchArchitect);
    const prompt = buildResearchPrompt(input.name, grounding.text, ctx, {
      groundingKind: grounding.kind,
      preferredLevel,
    });

    const result = await agent.generate(prompt, {
      structuredOutput: { schema: docResearchPlanSchema },
    });

    if (!result.object) {
      throw new Error("doc-research architect returned no structured plan");
    }

    await saveCurriculumPlan(curriculumId, result.object, 0, {
      defaultIncluded: false,
      preferredLevel,
    });
    await setCurriculumStrictOrder(curriculumId, result.object.strictOrder ?? false);
    await setCurriculumStatus(curriculumId, "ready");

    log.info(
      { curriculumId, modules: result.object.modules.length },
      "curriculum_researched",
    );
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_research_failed");
    await setCurriculumStatus(curriculumId, "failed");
  }
}

export async function retryResearch(curriculumId: string): Promise<void> {
  try {
    const curriculum = await getCurriculum(curriculumId);

    if (!curriculum) {
      throw new Error("curriculum not found for retry research");
    }

    const priorSourceRows = await getCurriculumSourceRows(curriculumId);
    const resolved = resolveRetryResearchSource(
      priorSourceRows
        .filter((row) => row.kind === "web_research" || row.kind === "llms_txt")
        .map((row) => ({ kind: row.kind, value: row.value })),
      curriculum.name,
    );

    await clearCurriculumStructure(curriculumId);
    await deleteResearchSources(curriculumId);

    // The chosen level from the original creation is not recovered on
    // retry — the same accepted limitation as reparse already has for
    // pasted-material curricula.
    if (resolved.mode === "url") {
      await researchCurriculum(curriculumId, { name: resolved.name, docUrl: resolved.docUrl });
    } else {
      await researchCurriculum(curriculumId, { name: resolved.name });
    }
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_retry_research_failed");
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
