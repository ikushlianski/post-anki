import type { LectureSourceCandidate } from "@post-anki/shared";
import { capGroundingText, hasUsableGroundingText, isSafeSourceUrl } from "@post-anki/core";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { getTopicRow } from "../topic/topic-progress.repo.js";
import {
  getCurriculumCitableUrls,
  getCurriculumContextForTopic,
  getCurriculumGroundingText,
  getCurriculumPromptContext,
} from "../curriculum/curriculum.repo.js";
import { gatherLectureSourceGrounding } from "../curriculum/tech-research-grounding.js";
import { resolveSourceText } from "../curriculum/source-fetch.js";
import {
  buildCurriculumSourceCandidates,
  mergeCandidatesPreferringCurriculum,
  selectValidCandidates,
} from "./lecture-rules.js";
import { lectureSourceCandidatesPlanSchema } from "./lecture-source-candidates.schema.js";
import { lecturePlanSchema } from "./lecture-plan.schema.js";
import {
  clearRegatherableCandidates,
  insertLectureSourceCandidates,
  listApprovedCandidatesForCompile,
  listLectureSourceCandidates,
  storeCandidateFetchedText,
} from "./lecture-source-candidate.repo.js";
import { replaceLectureContent, setLectureStatus } from "./lecture.repo.js";
import {
  resolveCourseGroundingSources,
  type CourseGroundingSource,
} from "./course-source-grounding.js";

interface ResolvedCurriculumContext {
  curriculumId: string;
  label: string;
}

async function resolveCurriculumContext(
  topicId: string,
): Promise<ResolvedCurriculumContext | null> {
  const ctx = await getCurriculumContextForTopic(topicId);

  if (!ctx) {
    return null;
  }

  const promptContext = await getCurriculumPromptContext(ctx.curriculumId);

  if (!promptContext) {
    return null;
  }

  return {
    curriculumId: ctx.curriculumId,
    label: `${promptContext.curriculumName} (subject: ${promptContext.subjectName})`,
  };
}

export async function gatherLectureSources(
  topicId: string,
): Promise<LectureSourceCandidate[]> {
  const topic = await getTopicRow(topicId);

  if (!topic) {
    throw new Error("topic not found for lecture source gathering");
  }

  const curriculumCtx = await resolveCurriculumContext(topicId);

  const curriculumGroundingText = curriculumCtx
    ? await getCurriculumGroundingText(curriculumCtx.curriculumId)
    : "";
  const curriculumHasUsableGrounding = hasUsableGroundingText(curriculumGroundingText);

  const curriculumCitableUrls =
    curriculumHasUsableGrounding && curriculumCtx
      ? (await getCurriculumCitableUrls(curriculumCtx.curriculumId)).filter(
          (url) => isSafeSourceUrl(url).allowed,
        )
      : [];
  const curriculumCandidates = buildCurriculumSourceCandidates(curriculumCitableUrls);

  const grounding = await gatherLectureSourceGrounding(topic.title, curriculumCtx?.label);

  const prompt = [
    `Topic: ${topic.title}`,
    curriculumCtx ? `Curriculum context: ${curriculumCtx.label}` : "",
    curriculumHasUsableGrounding
      ? `\nThis curriculum already has stored source material covering this topic:\n${capGroundingText(curriculumGroundingText)}`
      : "",
    "",
    "Grounding notes from web search:",
    grounding.text.length > 0 ? grounding.text : "(no grounding notes found)",
    "",
    "Citation URLs actually surfaced by the search (a candidate's url must be copied verbatim from this list):",
    grounding.citations.length > 0 ? grounding.citations.join("\n") : "(none)",
  ]
    .filter(Boolean)
    .join("\n");

  const agent = getMastra().getAgent(AGENT_KEYS.lectureSourceSelector);
  const result = await agent.generate(prompt, {
    structuredOutput: { schema: lectureSourceCandidatesPlanSchema },
  });

  const webValidated = selectValidCandidates(
    result.object?.candidates ?? [],
    grounding.citations,
  );
  const validated = mergeCandidatesPreferringCurriculum(curriculumCandidates, webValidated);

  await clearRegatherableCandidates(topicId);
  await insertLectureSourceCandidates(topicId, validated);

  return listLectureSourceCandidates(topicId);
}

async function resolveApprovedCandidateSources(
  topicId: string,
): Promise<CourseGroundingSource[]> {
  const approved = await listApprovedCandidatesForCompile(topicId);

  return Promise.all(
    approved.map(async (candidate) => {
      if (candidate.fetchedText !== null) {
        return { title: candidate.title, url: candidate.url, text: candidate.fetchedText };
      }

      const text = await resolveSourceText("url", candidate.url);
      await storeCandidateFetchedText(candidate.id, text);

      return { title: candidate.title, url: candidate.url, text };
    }),
  );
}

export async function compileLecture(topicId: string): Promise<void> {
  try {
    const ownSources = await resolveCourseGroundingSources(topicId);
    const sourcesWithText = ownSources ?? (await resolveApprovedCandidateSources(topicId));

    const combinedSourceText = sourcesWithText.map((s) => s.text).join("\n\n");

    if (!hasUsableGroundingText(combinedSourceText)) {
      log.warn({ topicId }, "lecture_compile_no_usable_grounding");
      await setLectureStatus(topicId, "failed");
      return;
    }

    const prompt = [
      "Approved sources:",
      sourcesWithText
        .map((s) => `# ${s.title} (${s.url})\n${capGroundingText(s.text)}`)
        .join("\n\n---\n\n"),
    ].join("\n");

    const agent = getMastra().getAgent(AGENT_KEYS.lectureCompiler);
    const result = await agent.generate(prompt, {
      structuredOutput: { schema: lecturePlanSchema },
    });

    if (!result.object) {
      throw new Error("lecture compiler returned no structured plan");
    }

    await replaceLectureContent(topicId, result.object);

    log.info(
      { topicId, sections: result.object.sections.length },
      "lecture_compiled",
    );
  } catch (err) {
    log.error({ err, topicId }, "lecture_compile_failed");
    await setLectureStatus(topicId, "failed");
  }
}
