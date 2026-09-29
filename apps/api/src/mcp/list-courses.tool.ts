import { z } from "zod";
import { listCurricula } from "../curriculum/curriculum.repo.js";
import { getSubjectNamesByIds } from "../subject/subject.repo.js";

export const LIST_COURSES_DEFAULT_LIMIT = 50;
export const LIST_COURSES_MAX_LIMIT = 200;

export const listCoursesInputSchema = z.object({
  subjectId: z.string().min(1).optional().describe("Only return courses under this subject"),
  limit: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(`Max items to return, default ${LIST_COURSES_DEFAULT_LIMIT}, clamped to ${LIST_COURSES_MAX_LIMIT}`),
  offset: z.number().int().min(0).optional().describe("Items to skip, default 0"),
});

export type ListCoursesInput = z.infer<typeof listCoursesInputSchema>;

export const listCoursesItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  subjectId: z.string(),
  subjectName: z.string().nullable(),
});

export const listCoursesResultSchema = z.object({
  items: z.array(listCoursesItemSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type ListCoursesItem = z.infer<typeof listCoursesItemSchema>;
export type ListCoursesResult = z.infer<typeof listCoursesResultSchema>;

// listCurricula already excludes container curricula; page before fetching
// subject names so only the returned page's subjects are looked up.
export async function listCourses(input: ListCoursesInput): Promise<ListCoursesResult> {
  const limit = Math.min(
    Math.max(input.limit ?? LIST_COURSES_DEFAULT_LIMIT, 0),
    LIST_COURSES_MAX_LIMIT,
  );
  const offset = Math.max(input.offset ?? 0, 0);

  const courses = await listCurricula(input.subjectId);
  const page = courses.slice(offset, offset + limit);

  const subjectIds = [...new Set(page.map((course) => course.subjectId))];
  const subjectNamesById = await getSubjectNamesByIds(subjectIds);

  const items = page.map((course) => ({
    id: course.id,
    name: course.name,
    subjectId: course.subjectId,
    subjectName: subjectNamesById.get(course.subjectId) ?? null,
  }));

  return {
    items,
    total: courses.length,
    limit,
    offset,
  };
}
