import { NonRetriableError } from "inngest";
import {
  DRAFT_PLACEHOLDER_BUSY,
  draftStructureOrThrow,
  finalizeStalePendingTurn,
  insertDraftPlaceholder,
} from "./curriculum-structure.js";
import { approveAllPendingSources, setCurriculumStatus } from "./curriculum.repo.js";
import { finishDraftJob, touchDraftJob } from "./curriculum-draft-jobs.repo.js";

export async function beginDraftStep(curriculumId: string, ownerToken?: string): Promise<void> {
  if (!(await touchDraftJob(curriculumId, ownerToken))) {
    throw new NonRetriableError("curriculum not found for draft");
  }
}

export async function approveDraftStep(curriculumId: string): Promise<void> {
  await approveAllPendingSources(curriculumId);
}

export async function finalizeStaleDraftStep(curriculumId: string): Promise<void> {
  await finalizeStalePendingTurn(curriculumId);
}

export async function placeholderDraftStep(curriculumId: string): Promise<string> {
  return insertDraftPlaceholder(curriculumId);
}

export async function draftStep(
  curriculumId: string,
  placeholderId: string,
  ownerToken?: string,
): Promise<{ status: "done"; modules: number } | { status: "busy"; modules: 0 }> {
  if (placeholderId === DRAFT_PLACEHOLDER_BUSY) {
    await finishDraftJob(curriculumId, ownerToken);

    return { status: "busy", modules: 0 };
  }

  await setCurriculumStatus(curriculumId, "shaping_structure");

  const modules = await draftStructureOrThrow(curriculumId, placeholderId);

  await finishDraftJob(curriculumId, ownerToken);

  return { status: "done", modules };
}
