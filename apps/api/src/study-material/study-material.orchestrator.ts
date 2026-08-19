import type { StudyMaterialKind } from "@post-anki/shared";
import { RequestContext } from "@mastra/core/request-context";
import {
  buildStudyMaterialPrompt,
  capGroundingText,
  hasUsableGroundingText,
  isSafeSourceUrl,
} from "@post-anki/core";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { getTopicRow } from "../topic/topic-progress.repo.js";
import { listGapsForTopic } from "../gap/gap.repo.js";
import {
  getCurriculumCitableUrls,
  getCurriculumContextForTopic,
  getCurriculumGroundingText,
} from "../curriculum/curriculum.repo.js";
import { webSearch } from "../probe/probe-grounding.js";
import { studyMaterialPlanSchema } from "./study-material-plan.schema.js";
import { setStudyMaterialFailed, setStudyMaterialReady } from "./study-material.repo.js";

interface StudyMaterialGrounding {
  text: string;
  citations: string[];
}

function joinGroundingText(a: string, b: string): string {
  return [a, b].filter((part) => part.trim().length > 0).join("\n\n---\n\n");
}

async function gatherAccumulatedTopicText(topicId: string): Promise<string> {
  const [topic, gapRows] = await Promise.all([getTopicRow(topicId), listGapsForTopic(topicId)]);

  const parts = [topic?.summary?.trim() ?? "", gapRows.map((gap) => gap.label).join("; ")].filter(
    (part) => part.length > 0,
  );

  return parts.join("\n\n");
}

async function gatherWebStudyMaterialGrounding(
  topicTitle: string,
  curriculumId?: string,
): Promise<{ text: string; citations: string[] }> {
  const prompt = [
    `Search the web for real, citable, authoritative material to ground a study-material request`,
    `about: ${topicTitle}.`,
    `Return concise notes covering the concrete facts, mechanics, or examples a learner would need —`,
    `not a summary of the topic in general terms.`,
  ].join(" ");

  const outcome = await webSearch(
    prompt,
    "study_material.web_grounding",
    { topicTitle },
    curriculumId ? { curriculumId } : {},
  );

  if (!outcome.ok) {
    return { text: "", citations: [] };
  }

  return { text: outcome.text, citations: outcome.citations };
}

async function gatherStudyMaterialGrounding(
  topicId: string,
  topicTitle: string,
): Promise<StudyMaterialGrounding> {
  const curriculumCtx = await getCurriculumContextForTopic(topicId);

  let combinedText = curriculumCtx
    ? await getCurriculumGroundingText(curriculumCtx.curriculumId)
    : "";
  let citations: string[] = [];

  if (curriculumCtx && combinedText.trim().length > 0) {
    citations = (await getCurriculumCitableUrls(curriculumCtx.curriculumId)).filter(
      (url) => isSafeSourceUrl(url).allowed,
    );
  }

  if (hasUsableGroundingText(combinedText)) {
    return { text: capGroundingText(combinedText), citations };
  }

  const accumulatedText = await gatherAccumulatedTopicText(topicId);
  combinedText = joinGroundingText(combinedText, accumulatedText);

  if (hasUsableGroundingText(combinedText)) {
    return { text: capGroundingText(combinedText), citations };
  }

  const web = await gatherWebStudyMaterialGrounding(topicTitle, curriculumCtx?.curriculumId);
  combinedText = joinGroundingText(combinedText, web.text);
  citations = [...citations, ...web.citations];

  return { text: capGroundingText(combinedText), citations };
}

export async function generateStudyMaterial(
  materialId: string,
  topicId: string,
  kind: StudyMaterialKind,
): Promise<void> {
  try {
    const topic = await getTopicRow(topicId);

    if (!topic) {
      throw new Error("topic not found for study material generation");
    }

    const grounding = await gatherStudyMaterialGrounding(topicId, topic.title);

    if (!hasUsableGroundingText(grounding.text)) {
      log.warn({ topicId, materialId, kind }, "study_material_no_usable_grounding");
      await setStudyMaterialFailed(
        materialId,
        "no usable grounding material found for this topic across its stored sources, accumulated topic/gap knowledge, or the web",
      );
      return;
    }

    const prompt = buildStudyMaterialPrompt(kind, topic.title, grounding.text, grounding.citations);
    const curriculumCtx = await getCurriculumContextForTopic(topicId);

    const agent = getMastra().getAgent(AGENT_KEYS.studyMaterialWriter);
    const result = await agent.generate(prompt, {
      structuredOutput: { schema: studyMaterialPlanSchema },
      requestContext: curriculumCtx
        ? new RequestContext([["curriculumId", curriculumCtx.curriculumId]])
        : undefined,
    });

    if (!result.object) {
      throw new Error("study material writer returned no structured plan");
    }

    const validCitations = result.object.citations.filter((citation) =>
      grounding.citations.includes(citation.url),
    );

    await setStudyMaterialReady(materialId, result.object.body, validCitations);

    log.info({ topicId, materialId, kind }, "study_material_generated");
  } catch (err) {
    log.error({ err, topicId, materialId, kind }, "study_material_generate_failed");
    await setStudyMaterialFailed(materialId, "generation failed");
  }
}
