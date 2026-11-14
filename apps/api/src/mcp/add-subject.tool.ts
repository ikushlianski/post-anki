import { z } from "zod";
import { SUBJECT_NAME_MAX_CHARS } from "@post-anki/shared";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { createSubject } from "../subject/subject.repo.js";
import { hasKnowledgeWriteScope } from "./card-write-scope.js";
import { findExistingSubject } from "./subject-ref.js";

export const addSubjectInputSchema = z.object({
  name: z.string().trim().min(1).max(SUBJECT_NAME_MAX_CHARS).describe("Name of the new subject"),
  parent: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("Existing parent subject id or path like \"English\"; omit for a top-level subject"),
});

export const addSubjectResultSchema = z.object({
  subjectId: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
});

export type AddSubjectInput = z.infer<typeof addSubjectInputSchema>;
export type AddSubjectResult = z.infer<typeof addSubjectResultSchema>;

export type AddSubjectOutcome = AddSubjectResult | { error: "missing_scope" | "parent_not_found" | "invalid_parent" };

export async function addSubject(
  input: AddSubjectInput,
  auth: Pick<RequestAuthContext, "scopes">,
): Promise<AddSubjectOutcome> {
  if (!hasKnowledgeWriteScope(auth)) {
    return { error: "missing_scope" };
  }

  let parentId: string | null = null;

  if (input.parent) {
    const parent = await findExistingSubject(input.parent);

    if ("error" in parent) {
      return { error: parent.error === "invalid_path" ? "invalid_parent" : "parent_not_found" };
    }

    parentId = parent.subjectId;
  }

  const subject = await createSubject({ name: input.name, kind: "architecture-mentor", parentId });

  return { subjectId: subject.id, name: subject.name, parentId };
}
