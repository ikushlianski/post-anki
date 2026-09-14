import { DEPTH_INTENT, type DepthLevel } from "@post-anki/shared";

export interface ExtractedCandidate {
  title: string;
  url: string;
  whySelected: string;
}

export interface LectureSourceWithText {
  title: string;
  url: string;
  text: string;
}

// A topic elected as "awareness" and one elected as "deep" used to compile
// through the identical prompt — depth data existed on the topic but never
// reached lecture generation. This makes the target depth an explicit
// instruction so a deep topic gets more sections/detail, an awareness one
// stays terse.
export function buildLectureCompilePrompt(
  sourcesWithText: LectureSourceWithText[],
  depth: DepthLevel,
  capGroundingText: (text: string) => string,
): string {
  return [
    `Target depth: ${depth} — ${DEPTH_INTENT[depth]}`,
    "Write only as many sections, and only as much detail per section, as that target depth calls for.",
    "",
    "Approved sources:",
    sourcesWithText
      .map((s) => `# ${s.title} (${s.url})\n${capGroundingText(s.text)}`)
      .join("\n\n---\n\n"),
  ].join("\n");
}

const CURRICULUM_SOURCE_CANDIDATE_CAP = 6;

export function buildCurriculumSourceCandidates(
  citableUrls: string[],
): ExtractedCandidate[] {
  return citableUrls.slice(0, CURRICULUM_SOURCE_CANDIDATE_CAP).map((url) => ({
    title: `Curriculum source: ${url}`,
    url,
    whySelected: "Already part of this curriculum's own stored sources.",
  }));
}

export function mergeCandidatesPreferringCurriculum(
  curriculumCandidates: ExtractedCandidate[],
  webCandidates: ExtractedCandidate[],
): ExtractedCandidate[] {
  const seen = new Set(curriculumCandidates.map((candidate) => candidate.url));
  const supplemental = webCandidates.filter((candidate) => !seen.has(candidate.url));

  return [...curriculumCandidates, ...supplemental];
}

export function selectValidCandidates(
  extracted: ExtractedCandidate[],
  citationUrls: string[],
): ExtractedCandidate[] {
  const citations = new Set(citationUrls);

  return extracted.filter((candidate) => citations.has(candidate.url));
}

export type LectureSourceCandidateReviewStatus = "pending" | "approved" | "rejected";

export interface RegatherableCandidateRow {
  id: string;
  reviewStatus: LectureSourceCandidateReviewStatus;
}

export interface RegatherPartition<T extends RegatherableCandidateRow> {
  toDelete: T[];
  toKeep: T[];
}

export function partitionRegatherableCandidates<T extends RegatherableCandidateRow>(
  existingRows: T[],
): RegatherPartition<T> {
  const toDelete: T[] = [];
  const toKeep: T[] = [];

  for (const row of existingRows) {
    if (row.reviewStatus === "approved") {
      toKeep.push(row);
    } else {
      toDelete.push(row);
    }
  }

  return { toDelete, toKeep };
}

export interface ReviewableCandidateRow {
  reviewStatus: LectureSourceCandidateReviewStatus;
}

export function selectApprovedForCompile<T extends ReviewableCandidateRow>(
  candidateRows: T[],
): T[] {
  return candidateRows.filter((row) => row.reviewStatus === "approved");
}
