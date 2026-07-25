import { and, desc, eq, inArray } from "drizzle-orm";
import type { Pack, PracticeLevel, PracticeSettings } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { attempts, languagePracticeSettings, phrases } from "../db/schema.js";

const DEFAULT_LEVEL: PracticeLevel = "B1_B2";
const DEFAULT_PACK: Pack = "General";

export type PhraseInsertRow = typeof phrases.$inferInsert;
export type PhraseSelectRow = typeof phrases.$inferSelect;
export type AttemptInsertRow = typeof attempts.$inferInsert;

function toSettings(row: typeof languagePracticeSettings.$inferSelect): PracticeSettings {
  return {
    subjectId: row.subjectId,
    level: row.level as PracticeLevel,
    pack: row.pack as Pack,
  };
}

export async function getOrCreatePracticeSettings(
  subjectId: string,
): Promise<PracticeSettings> {
  const existing = (
    await getDb()
      .select()
      .from(languagePracticeSettings)
      .where(eq(languagePracticeSettings.subjectId, subjectId))
  )[0];

  if (existing) {
    return toSettings(existing);
  }

  await getDb()
    .insert(languagePracticeSettings)
    .values({ subjectId, level: DEFAULT_LEVEL, pack: DEFAULT_PACK })
    .onConflictDoNothing();

  return { subjectId, level: DEFAULT_LEVEL, pack: DEFAULT_PACK };
}

export async function updatePracticeSettings(
  subjectId: string,
  patch: { level?: PracticeLevel; pack?: Pack },
): Promise<PracticeSettings> {
  const current = await getOrCreatePracticeSettings(subjectId);
  const level = patch.level ?? current.level;
  const pack = patch.pack ?? current.pack;

  await getDb()
    .update(languagePracticeSettings)
    .set({ level, pack, updatedAt: new Date() })
    .where(eq(languagePracticeSettings.subjectId, subjectId));

  return { subjectId, level, pack };
}

export async function recentRussianForSubject(
  subjectId: string,
  level: PracticeLevel,
  pack: Pack,
  limit = 40,
): Promise<string[]> {
  const rows = await getDb()
    .select({ russian: phrases.russian })
    .from(phrases)
    .where(
      and(
        eq(phrases.subjectId, subjectId),
        eq(phrases.level, level),
        eq(phrases.pack, pack),
      ),
    )
    .orderBy(desc(phrases.createdAt))
    .limit(limit);

  return rows.map((r) => r.russian);
}

export async function insertPhraseBatch(rows: PhraseInsertRow[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  await getDb().insert(phrases).values(rows);
}

export async function insertAttempts(rows: AttemptInsertRow[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  await getDb().insert(attempts).values(rows);
}

export async function getPhrasesByIds(phraseIds: string[]): Promise<PhraseSelectRow[]> {
  if (phraseIds.length === 0) {
    return [];
  }

  return getDb().select().from(phrases).where(inArray(phrases.id, phraseIds));
}
