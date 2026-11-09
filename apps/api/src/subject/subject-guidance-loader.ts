import { getDb } from "../db/client.js";
import { subjects } from "../db/schema.js";
import {
  buildSubjectGuidanceBlock,
  pickSubjectGuidance,
  type SubjectGuidanceRow,
} from "./subject-extraction-guidance.js";

export async function loadSubjectGuidanceBlock(subjectId: string | null): Promise<string> {
  if (!subjectId) {
    return "";
  }

  const rows: SubjectGuidanceRow[] = await getDb()
    .select({
      id: subjects.id,
      parentId: subjects.parentId,
      extractionInstructions: subjects.extractionInstructions,
      extractionExamples: subjects.extractionExamples,
    })
    .from(subjects);

  return buildSubjectGuidanceBlock(pickSubjectGuidance(subjectId, rows));
}

export function joinPromptBlocks(...blocks: string[]): string {
  return blocks.filter(Boolean).join("\n");
}
