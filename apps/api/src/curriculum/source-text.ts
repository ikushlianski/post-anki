import { resolveSourceText } from "./source-fetch.js";
import { getCurriculumSourceRows, storeFetchedText } from "./curriculum.repo.js";

/**
 * Assembles every source row's text (fetching + caching it first if it
 * hasn't been resolved yet) into one combined document for an architect-
 * agent prompt. Shared between `curriculum-parse.orchestrator.ts` (the
 * legacy/merge paths) and `curriculum-structure.ts` (Phase 5's draft-
 * structure shaping) so neither file needs to import the other just for
 * this — avoids a circular module dependency between the two orchestrators.
 */
export async function assembleAllSourceText(curriculumId: string): Promise<string> {
  const rows = await getCurriculumSourceRows(curriculumId);

  const parts = await Promise.all(
    rows.map(async (row) => {
      let text = row.fetchedText;

      if (text === null) {
        text = await resolveSourceText(row.kind, row.value);
        await storeFetchedText(row.id, text);
      }

      return row.title ? `# ${row.title}\n${text}` : text;
    }),
  );

  return parts.filter((p) => p.trim().length > 0).join("\n\n---\n\n");
}
