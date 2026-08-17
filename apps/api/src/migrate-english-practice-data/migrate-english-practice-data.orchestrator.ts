import type { Pack } from "@post-anki/shared";
import type { Db } from "../db/client.js";
import { readSourcePhraseBankJson } from "./migrate-english-practice-data.source-json.js";
import {
  findSubjectIdByName,
  flipSubjectKindToLanguagePractice,
  insertMigratedAttempts,
  insertMigratedPhraseBankAppearances,
  insertMigratedPhraseBankEntries,
  insertMigratedPhrases,
  nextSequenceBase,
  readSourceAttempts,
  readSourcePhrases,
  readSourceSettings,
  upsertLanguagePracticeSettings,
  type SourceQueryPool,
} from "./migrate-english-practice-data.repo.js";
import { planPhraseAndAttemptMigration } from "./migrate-english-practice-data.plan-phrases.js";
import {
  planPhraseBankMigration,
  type SampleMigratedEntry,
} from "./migrate-english-practice-data.plan-phrase-bank.js";

const PACK: Pack = "General";
const DEFAULT_SUBJECT_NAME = "English";

export interface RunMigrationOptions {
  dryRun: boolean;
  sourcePool: SourceQueryPool;
  db: Db;
  learningDir: string;
  subjectName?: string;
}

export interface MigrationTableCount {
  toCreate: number;
  alreadyPresent: number;
}

export interface PhraseBankEntryTableCount extends MigrationTableCount {
  activeToCreate: number;
  masteredToCreate: number;
}

export type { SampleMigratedEntry };

export interface MigrationSummary {
  phrases: MigrationTableCount;
  attempts: MigrationTableCount;
  phraseBankEntries: PhraseBankEntryTableCount;
  phraseBankAppearances: MigrationTableCount;
  sampleEntry: SampleMigratedEntry | null;
}

// The real read → derive → write sequence (SCENARIO 1, 2, 3, 4, 5, 6, 7, 9,
// 10, 11, 12). Reads always run in full, dry-run or live, so the printed
// summary is always an accurate preview of what a live run would do
// (SCENARIO 5); only the final write step is skipped when dryRun is true.
// The two plan* helpers (migrate-english-practice-data.plan-phrases.ts,
// migrate-english-practice-data.plan-phrase-bank.ts) do all the actual
// read + derive work; this function only sequences them and, when live,
// performs the write.
export async function runMigration(options: RunMigrationOptions): Promise<MigrationSummary> {
  const { dryRun, sourcePool, db, learningDir, subjectName = DEFAULT_SUBJECT_NAME } = options;

  const subjectId = await findSubjectIdByName(subjectName, db);

  if (!subjectId) {
    throw new Error(
      `migrate-english-practice-data: prerequisite subject "${subjectName}" does not exist — it must already be seeded (see seed-subjects.ts)`,
    );
  }

  const sourceSettings = await readSourceSettings(sourcePool);
  const pbeLevel = sourceSettings.level;

  const sourcePhrases = await readSourcePhrases(sourcePool);
  const sourceAttempts = await readSourceAttempts(sourcePool);
  const { active, mastered } = await readSourcePhraseBankJson(learningDir);

  const phrasePlan = await planPhraseAndAttemptMigration(subjectId, sourcePhrases, sourceAttempts, db);

  // SCENARIO 12 — the phrase-bank level's post-import ceiling comes from the
  // phrase plan's own computed map whenever that level had any source
  // phrases at all; only falls back to a fresh read when it didn't (that
  // level's ceiling is then genuinely unchanged by this run).
  let postImportMaxForPbeLevel = phrasePlan.postImportMaxByLevel.get(pbeLevel);

  if (postImportMaxForPbeLevel === undefined) {
    postImportMaxForPbeLevel = await nextSequenceBase(subjectId, pbeLevel, PACK, db);
  }

  const pbePlan = await planPhraseBankMigration(
    subjectId,
    pbeLevel,
    PACK,
    active,
    mastered,
    postImportMaxForPbeLevel,
    db,
  );

  const summary: MigrationSummary = {
    phrases: { toCreate: phrasePlan.phrasesToCreate, alreadyPresent: phrasePlan.phrasesAlreadyPresent },
    attempts: {
      toCreate: phrasePlan.attemptInsertRows.length,
      alreadyPresent: phrasePlan.attemptsAlreadyPresent,
    },
    phraseBankEntries: {
      toCreate: pbePlan.entriesToCreate,
      alreadyPresent: pbePlan.entriesAlreadyPresent,
      activeToCreate: pbePlan.activeToCreate,
      masteredToCreate: pbePlan.masteredToCreate,
    },
    phraseBankAppearances: {
      toCreate: pbePlan.appearanceInsertRows.length,
      alreadyPresent: pbePlan.appearancesAlreadyPresent,
    },
    sampleEntry: pbePlan.sampleEntry,
  };

  // SCENARIO 5 — zero INSERT/UPDATE statements issued against the target
  // when dryRun is true; everything above this point is read-only.
  if (dryRun) {
    return summary;
  }

  // Decision 13 — the entire live write is one transaction: a crash before
  // commit rolls back to exactly the pre-run state (SCENARIO 9).
  await db.transaction(async (tx) => {
    await flipSubjectKindToLanguagePractice(subjectId, tx);
    await insertMigratedPhrases(phrasePlan.phraseInsertRows, tx);
    await insertMigratedAttempts(phrasePlan.attemptInsertRows, tx);
    await upsertLanguagePracticeSettings(subjectId, pbeLevel, PACK, tx);
    // phrase_bank_entries before phrase_bank_appearances — the one real
    // insert-order dependency in this transaction (SCENARIO 9).
    await insertMigratedPhraseBankEntries(pbePlan.entryInsertRows, tx);
    await insertMigratedPhraseBankAppearances(pbePlan.appearanceInsertRows, tx);
  });

  return summary;
}
