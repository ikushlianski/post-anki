import { resolveAreaPlacement } from "@post-anki/core";
import type { TaxonomyArea } from "@post-anki/shared";

export interface SubSubjectCandidate {
  subSubjectNodeId: string;
  subSubjectName: string;
  areas: TaxonomyArea[];
}

export interface TaxonomyProposalInput {
  candidates: SubSubjectCandidate[];
  pinnedSubSubjectNodeId: string | null;
  proposedSubSubjectName: string | null;
  proposedAreaName: string | null;
}

export interface ValidatedTaxonomyPlacement {
  subSubjectNodeId: string | null;
  areaId: string | null;
  areaName: string | null;
}

export function validateTaxonomyProposal(
  input: TaxonomyProposalInput,
): ValidatedTaxonomyPlacement {
  const subSubject = resolveSubSubject(input);

  if (subSubject === null) {
    return { subSubjectNodeId: null, areaId: null, areaName: null };
  }

  const areaId = resolveAreaPlacement(input.proposedAreaName, subSubject.areas);
  const area = subSubject.areas.find((candidate) => candidate.id === areaId) ?? null;

  return {
    subSubjectNodeId: subSubject.subSubjectNodeId,
    areaId: area ? area.id : null,
    areaName: area ? area.name : null,
  };
}

function resolveSubSubject(input: TaxonomyProposalInput): SubSubjectCandidate | null {
  if (input.pinnedSubSubjectNodeId !== null) {
    return (
      input.candidates.find(
        (candidate) => candidate.subSubjectNodeId === input.pinnedSubSubjectNodeId,
      ) ?? null
    );
  }

  const proposed = normalize(input.proposedSubSubjectName ?? "");

  if (proposed.length === 0) {
    return null;
  }

  return (
    input.candidates.find((candidate) => normalize(candidate.subSubjectName) === proposed) ?? null
  );
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
