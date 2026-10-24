import { startPastedDraft } from "./curriculum-draft.starter.js";
import { startResearch } from "./curriculum-jobs.starter.js";
import { startParse } from "./curriculum-parse.starter.js";

export interface CreateJobInput {
  materialPasted: boolean;
  pastedMaterial: string | null;
  pastedInsertedEarly: boolean;
  docUrl: string | null;
  researchTopic: string | null;
}

export interface CreateJob {
  start: () => Promise<void>;
  errorEvent: string;
}

export function pickCreateJob(curriculum: { id: string; name: string }, input: CreateJobInput): CreateJob {
  if (input.materialPasted && input.pastedMaterial !== null) {
    const material = input.pastedMaterial;

    return {
      start: () => startPastedDraft(curriculum.id, material, input.pastedInsertedEarly),
      errorEvent: "pasted_material_dispatch_failed",
    };
  }

  if (input.docUrl) {
    const docUrl = input.docUrl;

    return {
      start: () => startResearch(curriculum.id, { name: curriculum.name, docUrl }),
      errorEvent: "research_dispatch_failed",
    };
  }

  if (input.researchTopic) {
    const name = input.researchTopic;

    return { start: () => startResearch(curriculum.id, { name }), errorEvent: "research_dispatch_failed" };
  }

  return { start: () => startParse(curriculum.id), errorEvent: "parse_dispatch_failed" };
}
