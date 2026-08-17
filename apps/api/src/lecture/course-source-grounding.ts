import { and, eq } from "drizzle-orm";
import { getCurriculum, storeFetchedText } from "../curriculum/curriculum.repo.js";
import { resolveSourceText } from "../curriculum/source-fetch.js";
import { getDb } from "../db/client.js";
import { sources } from "../db/schema.js";
import { getTopicRow } from "../topic/topic-progress.repo.js";

export interface CourseGroundingSource {
  title: string;
  url: string;
  text: string;
}

interface OwnSourceRow {
  id: string;
  kind: string;
  value: string;
  title: string | null;
  fetchedText: string | null;
}

async function loadApprovedOwnSourceRows(topicId: string): Promise<OwnSourceRow[] | null> {
  const topic = await getTopicRow(topicId);

  if (!topic) {
    return null;
  }

  const curriculum = await getCurriculum(topic.curriculumId);

  if (!curriculum || curriculum.origin !== "sources") {
    return null;
  }

  const rows = await getDb()
    .select({
      id: sources.id,
      kind: sources.kind,
      value: sources.value,
      title: sources.title,
      fetchedText: sources.fetchedText,
    })
    .from(sources)
    .where(and(eq(sources.curriculumId, topic.curriculumId), eq(sources.approvalStatus, "approved")));

  if (rows.length === 0) {
    return null;
  }

  if (topic.sourceId) {
    const ownChapterSource = rows.filter((row) => row.id === topic.sourceId);

    return ownChapterSource.length > 0 ? ownChapterSource : null;
  }

  return rows;
}

export async function hasCourseOwnSources(topicId: string): Promise<boolean> {
  const rows = await loadApprovedOwnSourceRows(topicId);

  return rows !== null && rows.length > 0;
}

export async function resolveCourseGroundingSources(
  topicId: string,
): Promise<CourseGroundingSource[] | null> {
  const rows = await loadApprovedOwnSourceRows(topicId);

  if (rows === null) {
    return null;
  }

  return Promise.all(
    rows.map(async (row) => {
      let text = row.fetchedText;

      if (text === null) {
        text = await resolveSourceText(row.kind, row.value);
        await storeFetchedText(row.id, text);
      }

      return { title: row.title ?? row.value, url: row.value, text };
    }),
  );
}
