import { z } from "zod";
import { listCardsForCurriculum } from "../cards/list-cards-for-curriculum.repo.js";
import { curriculumExists } from "../curriculum/curriculum-exists.repo.js";

export const LIST_COURSE_CARDS_DEFAULT_LIMIT = 50;
export const LIST_COURSE_CARDS_MAX_LIMIT = 200;

export const listCourseCardsInputSchema = z.object({
  curriculumId: z.string().min(1).describe("Course id, e.g. from list_courses"),
  limit: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      `Max items to return, default ${LIST_COURSE_CARDS_DEFAULT_LIMIT}, clamped to ${LIST_COURSE_CARDS_MAX_LIMIT}`,
    ),
  offset: z.number().int().min(0).optional().describe("Items to skip, default 0"),
});

export type ListCourseCardsInput = z.infer<typeof listCourseCardsInputSchema>;

export const listCourseCardsItemSchema = z.object({
  cardId: z.string(),
  topicId: z.string(),
  topicTitle: z.string(),
  concept: z.string(),
  prompt: z.string(),
  answer: z.string(),
});

export const listCourseCardsResultSchema = z.object({
  items: z.array(listCourseCardsItemSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type ListCourseCardsItem = z.infer<typeof listCourseCardsItemSchema>;
export type ListCourseCardsResult = z.infer<typeof listCourseCardsResultSchema>;

export async function listCourseCards(
  input: ListCourseCardsInput,
): Promise<ListCourseCardsResult | null> {
  if (!(await curriculumExists(input.curriculumId))) {
    return null;
  }

  const limit = Math.min(
    Math.max(input.limit ?? LIST_COURSE_CARDS_DEFAULT_LIMIT, 0),
    LIST_COURSE_CARDS_MAX_LIMIT,
  );
  const offset = Math.max(input.offset ?? 0, 0);

  const rows = await listCardsForCurriculum(input.curriculumId);
  const page = rows.slice(offset, offset + limit);

  const items = page.map((row) => ({
    cardId: row.cardId,
    topicId: row.topicId,
    topicTitle: row.topicTitle,
    concept: row.concept,
    prompt: row.prompt,
    answer: row.answer,
  }));

  return {
    items,
    total: rows.length,
    limit,
    offset,
  };
}
