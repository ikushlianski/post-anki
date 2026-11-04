import { eq } from "drizzle-orm";
import {
  DEFAULT_DETAIL_LEVEL,
  DEFAULT_HINTING_ENABLED,
  detailLevelSchema,
  type DetailLevel,
} from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { subjects } from "../db/schema.js";

export async function resolveDetailLevel(subjectId: string | null): Promise<DetailLevel> {
  if (!subjectId) {
    return DEFAULT_DETAIL_LEVEL;
  }

  const [row] = await getDb()
    .select({ detailLevel: subjects.detailLevel })
    .from(subjects)
    .where(eq(subjects.id, subjectId));

  return detailLevelSchema.catch(DEFAULT_DETAIL_LEVEL).parse(row?.detailLevel ?? DEFAULT_DETAIL_LEVEL);
}

export async function resolveHintingEnabled(subjectId: string | null): Promise<boolean> {
  if (!subjectId) {
    return DEFAULT_HINTING_ENABLED;
  }

  const [row] = await getDb()
    .select({ hintingEnabled: subjects.hintingEnabled })
    .from(subjects)
    .where(eq(subjects.id, subjectId));

  return row?.hintingEnabled ?? DEFAULT_HINTING_ENABLED;
}
