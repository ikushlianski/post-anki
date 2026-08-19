import { resolveCourseGroundingSources } from "../lecture/course-source-grounding.js";

export interface PageGroundedContext {
  text: string;
  citations: string[];
}

// S3 — the topic-open-time grounding source for a topic's questions,
// scoped to the topic's own crawled source page(s) via topics.sourceId
// (never the curriculum-wide pasted text or an unrelated web search).
// Only ever called from startProbe, the sole entry point a topic-open
// reaches, so no page's material is touched before the learner actually
// opens that topic. resolveCourseGroundingSources itself never re-fetches
// a source once fetchedText is already stored, so re-opening an
// already-visited topic reuses the same grounding rather than
// regenerating it against the source site.
export async function gatherPageGroundedQuestionContext(
  topicId: string,
): Promise<PageGroundedContext | null> {
  const sources = await resolveCourseGroundingSources(topicId);

  if (!sources || sources.length === 0) {
    return null;
  }

  const withText = sources.filter((s) => s.text.trim().length > 0);

  if (withText.length === 0) {
    return null;
  }

  return {
    text: withText.map((s) => `${s.title} (${s.url}):\n${s.text}`).join("\n\n"),
    citations: withText.map((s) => s.url),
  };
}
