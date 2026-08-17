export interface ExtractedCandidate {
  title: string;
  url: string;
  whySelected: string;
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
