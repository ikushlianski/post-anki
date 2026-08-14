import type { TopicProgressStatus } from "@post-anki/shared";
import { getCurricula, getCurriculumDetail, getSubjects } from "../api/client.js";

const STEER_SHAPE_MAX_LEN = 40;

// Same discipline reply.ts:19-24 already uses for CONTINUE_PATTERNS' trailing
// tool name: a real answer that happens to open with a short phrase but then
// runs on into a full sentence must fall through to normal answer handling,
// not be misread as a topic switch. The `\s+` (not `\s*`) in the punctuation
// check is deliberate — a dotted product name with no following space
// ("Node.js", "socket.io") must not be rejected just for containing a period.
export function isSteerShaped(text: string): boolean {
  const trimmed = text.trim();

  if (trimmed.length === 0 || trimmed.length > STEER_SHAPE_MAX_LEN) return false;
  if (trimmed.includes(",")) return false;
  if (/[.!?]\s+\S/.test(trimmed)) return false;

  return true;
}

const STOPWORDS = new Set(["the", "a", "an", "of", "and", "in", "on", "for", "to", "is", "are"]);

function significantWords(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

export interface TopicCandidate {
  topicId: string;
  curriculumId: string;
  title: string;
  topicStatus: TopicProgressStatus;
}

// Recall-biased on purpose (todo.md "Decisions made autonomously" #3): any
// shared significant word counts, tie-break toward the shorter/more specific
// title. A false negative here just falls through to normal answer handling
// — a false positive is prevented upstream by isSteerShaped, not by scoring
// precision, so this stays a plain word-overlap count rather than fuzzy or
// embedding matching.
export function matchTopicTitle(
  text: string,
  candidates: TopicCandidate[],
): TopicCandidate | null {
  const textWords = new Set(significantWords(text));
  let best: TopicCandidate | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const titleWords = significantWords(candidate.title);
    const score = titleWords.filter((w) => textWords.has(w)).length;

    if (score === 0) continue;

    if (score > bestScore || (score === bestScore && best && candidate.title.length < best.title.length)) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

// The one I/O call in this file, gated behind isSteerShaped by its only
// caller (session-pivot-flow.ts's steerToTopic) so it never runs on an
// ordinary Socratic answer. Carries topicStatus alongside id/title so the
// caller can decide quiz-vs-Socratic without a second getCurriculumDetail
// round trip for the same curriculum.
export async function findRegisteredTopic(text: string): Promise<TopicCandidate | null> {
  const subjects = await getSubjects();
  const curriculaBySubject = await Promise.all(subjects.map((s) => getCurricula(s.id)));
  const confirmed = curriculaBySubject.flat().filter((c) => c.status === "confirmed");
  const details = await Promise.all(confirmed.map((c) => getCurriculumDetail(c.id)));

  const candidates: TopicCandidate[] = details.flatMap((d) =>
    d.modules.flatMap((m) =>
      m.topics
        .filter((t) => t.included)
        .map((t) => ({
          topicId: t.id,
          curriculumId: d.curriculum.id,
          title: t.title,
          topicStatus: t.progress.status,
        })),
    ),
  );

  return matchTopicTitle(text, candidates);
}
