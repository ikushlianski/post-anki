import type { LectureSourceCandidate } from "@post-anki/shared";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { getTopicRow } from "../topic/topic-progress.repo.js";
import {
  getCurriculumContextForTopic,
  getCurriculumPromptContext,
} from "../curriculum/curriculum.repo.js";
import { gatherLectureSourceGrounding } from "../curriculum/tech-research-grounding.js";
import { resolveSourceText } from "../curriculum/source-fetch.js";
import { selectValidCandidates } from "./lecture-rules.js";
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

async function resolveCurriculumContext(topicId: string): Promise<string | undefined> {
  const ctx = await getCurriculumContextForTopic(topicId);

  if (!ctx) {
    return undefined;
  }

  const promptContext = await getCurriculumPromptContext(ctx.curriculumId);

  if (!promptContext) {
    return undefined;
  }

  return `${promptContext.curriculumName} (subject: ${promptContext.subjectName})`;
}

export async function gatherLectureSources(
  topicId: string,
): Promise<LectureSourceCandidate[]> {
  const topic = await getTopicRow(topicId);

  if (!topic) {
    throw new Error("topic not found for lecture source gathering");
  }

  const curriculumContext = await resolveCurriculumContext(topicId);
  const grounding = await gatherLectureSourceGrounding(topic.title, curriculumContext);

  const prompt = [
    `Topic: ${topic.title}`,
    curriculumContext ? `Curriculum context: ${curriculumContext}` : "",
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

  const validated = selectValidCandidates(
    result.object?.candidates ?? [],
    grounding.citations,
  );

  await clearRegatherableCandidates(topicId);
  await insertLectureSourceCandidates(topicId, validated);

  return listLectureSourceCandidates(topicId);
}

export async function compileLecture(topicId: string): Promise<void> {
  try {
    const approved = await listApprovedCandidatesForCompile(topicId);

    const sourcesWithText = await Promise.all(
      approved.map(async (candidate) => {
        if (candidate.fetchedText !== null) {
          return { title: candidate.title, url: candidate.url, text: candidate.fetchedText };
        }

        const text = await resolveSourceText("url", candidate.url);
        await storeCandidateFetchedText(candidate.id, text);

        return { title: candidate.title, url: candidate.url, text };
      }),
    );

    const prompt = [
      "Approved sources:",
      sourcesWithText.length > 0
        ? sourcesWithText
            .map((s) => `# ${s.title} (${s.url})\n${s.text}`)
            .join("\n\n---\n\n")
        : "(no approved sources with usable text — produce your best-effort synthesis)",
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
