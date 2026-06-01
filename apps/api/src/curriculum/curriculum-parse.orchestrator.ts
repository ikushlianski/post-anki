import type { SourceDraft } from "@post-anki/shared";
import { createCurriculumArchitect } from "../mastra/curriculum-architect.agent.js";
import { log } from "../shared/log.js";
import { curriculumPlanSchema, curriculumMergePlanSchema } from "./curriculum-plan.js";
import { gatherSourceText } from "./source-fetch.js";
import {
  addCurriculumSources,
  clearCurriculumStructure,
  countModules,
  existingStructureTitles,
  getCurriculumSourceDrafts,
  saveCurriculumPlan,
  setCurriculumStatus,
} from "./curriculum.repo.js";

export async function parseCurriculum(
  curriculumId: string,
  name: string,
  sources: SourceDraft[],
): Promise<void> {
  try {
    const sourceText = await gatherSourceText(sources);
    const agent = createCurriculumArchitect();

    const prompt = [
      `Curriculum: ${name}`,
      "",
      "Pasted source material:",
      sourceText.length > 0
        ? sourceText
        : "(no sources pasted — propose a sensible module/topic skeleton for this curriculum name)",
    ].join("\n");

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

export async function reparseCurriculum(
  curriculumId: string,
  name: string,
): Promise<void> {
  try {
    const drafts = await getCurriculumSourceDrafts(curriculumId);
    await clearCurriculumStructure(curriculumId);
    await parseCurriculum(curriculumId, name, drafts);
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_reparse_failed");
    await setCurriculumStatus(curriculumId, "failed");
  }
}

export async function mergeSourcesIntoCurriculum(
  curriculumId: string,
  name: string,
  newDrafts: SourceDraft[],
): Promise<void> {
  try {
    await addCurriculumSources(curriculumId, newDrafts);
    await setCurriculumStatus(curriculumId, "curating");

    const sourceText = await gatherSourceText(newDrafts);
    const existing = await existingStructureTitles(curriculumId);
    const agent = createCurriculumArchitect();

    const prompt = [
      `Curriculum: ${name}`,
      "",
      "This curriculum ALREADY has these modules:",
      existing.modules.length > 0
        ? existing.modules.map((m) => `- ${m}`).join("\n")
        : "(none yet)",
      "",
      "And these topics already exist (do NOT repeat them):",
      existing.topics.length > 0
        ? existing.topics.map((t) => `- ${t}`).join("\n")
        : "(none yet)",
      "",
      "New source material to fold in — produce ONLY genuinely new modules/topics not already covered above. If the new material adds nothing new, return an empty modules array.",
      "",
      sourceText.length > 0 ? sourceText : "(empty source)",
    ].join("\n");

    const result = await agent.generate(prompt, {
      structuredOutput: { schema: curriculumMergePlanSchema },
    });

    if (result.object && result.object.modules.length > 0) {
      const offset = await countModules(curriculumId);
      await saveCurriculumPlan(curriculumId, result.object, offset);
    }

    await setCurriculumStatus(curriculumId, "ready");

    log.info(
      { curriculumId, added: result.object?.modules.length ?? 0 },
      "curriculum_sources_merged",
    );
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_merge_failed");
    await setCurriculumStatus(curriculumId, "failed");
  }
}
