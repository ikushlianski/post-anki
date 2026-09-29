import { z } from "zod";
import { getCourseOutline } from "../curriculum/curriculum-outline.repo.js";

export const getCourseStructureInputSchema = z.object({
  curriculumId: z.string().min(1).describe("Course id, e.g. from list_courses"),
});

export type GetCourseStructureInput = z.infer<typeof getCourseStructureInputSchema>;

export const getCourseStructureTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number(),
  cardSetStatus: z.string().nullable(),
});

export const getCourseStructureModuleSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number(),
  topics: z.array(getCourseStructureTopicSchema),
});

export const getCourseStructureResultSchema = z.object({
  curriculum: z.object({
    id: z.string(),
    name: z.string(),
    subjectId: z.string(),
  }),
  modules: z.array(getCourseStructureModuleSchema),
});

export type GetCourseStructureResult = z.infer<typeof getCourseStructureResultSchema>;

// Returns null for an unknown curriculum id; registerTool maps that to isError.
export async function getCourseStructure(
  input: GetCourseStructureInput,
): Promise<GetCourseStructureResult | null> {
  const outline = await getCourseOutline(input.curriculumId);

  return outline ? getCourseStructureResultSchema.parse(outline) : null;
}
