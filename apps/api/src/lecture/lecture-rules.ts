export interface ExtractedCandidate {
  title: string;
  url: string;
  whySelected: string;
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
