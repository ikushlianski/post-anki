import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { curricula, modules, topics, topicCardSets } from "../db/schema.js";

export const courseOutlineTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number(),
  cardSetStatus: z.string().nullable(),
});

export const courseOutlineModuleSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number(),
  topics: z.array(courseOutlineTopicSchema),
});

export const courseOutlineSchema = z.object({
  curriculum: z.object({ id: z.string(), name: z.string(), subjectId: z.string() }),
  modules: z.array(courseOutlineModuleSchema),
});

export type CourseOutlineTopic = z.infer<typeof courseOutlineTopicSchema>;
export type CourseOutlineModule = z.infer<typeof courseOutlineModuleSchema>;
export type CourseOutline = z.infer<typeof courseOutlineSchema>;

// Deliberately not built on getModuleProgressSnapshots: its MergeTopicSnapshot
// has no topic id and carries progress/merge internals this contract omits.
export async function getCourseOutline(curriculumId: string): Promise<CourseOutline | null> {
  const db = getDb();

  const curriculumRow = (
    await db.select().from(curricula).where(eq(curricula.id, curriculumId))
  )[0];

  if (!curriculumRow) {
    return null;
  }

  const moduleRows = await db
    .select()
    .from(modules)
    .where(eq(modules.curriculumId, curriculumId))
    .orderBy(asc(modules.order));

  if (moduleRows.length === 0) {
    return {
      curriculum: {
        id: curriculumRow.id,
        name: curriculumRow.name,
        subjectId: curriculumRow.subjectId,
      },
      modules: [],
    };
  }

  const topicRows = await db
    .select()
    .from(topics)
    .where(
      inArray(
        topics.moduleId,
        moduleRows.map((m) => m.id),
      ),
    )
    .orderBy(asc(topics.order));

  const cardSetRows =
    topicRows.length === 0
      ? []
      : await db
          .select({ topicId: topicCardSets.topicId, status: topicCardSets.status })
          .from(topicCardSets)
          .where(
            inArray(
              topicCardSets.topicId,
              topicRows.map((t) => t.id),
            ),
          );

  const cardSetStatusByTopicId = new Map(cardSetRows.map((row) => [row.topicId, row.status]));

  const topicsByModuleId = new Map<string, CourseOutlineTopic[]>();

  for (const topic of topicRows) {
    const list = topicsByModuleId.get(topic.moduleId) ?? [];

    list.push({
      id: topic.id,
      title: topic.title,
      order: topic.order,
      cardSetStatus: cardSetStatusByTopicId.get(topic.id) ?? null,
    });
    topicsByModuleId.set(topic.moduleId, list);
  }

  return {
    curriculum: {
      id: curriculumRow.id,
      name: curriculumRow.name,
      subjectId: curriculumRow.subjectId,
    },
    modules: moduleRows.map((moduleRow) => ({
      id: moduleRow.id,
      title: moduleRow.title,
      order: moduleRow.order,
      topics: topicsByModuleId.get(moduleRow.id) ?? [],
    })),
  };
}
