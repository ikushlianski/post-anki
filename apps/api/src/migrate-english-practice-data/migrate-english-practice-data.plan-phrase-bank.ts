import type { Pack, PracticeLevel } from "@post-anki/shared";
import type { DbExecutor } from "../db/client.js";
import { buildImportId, deriveActivePhraseBankStatus, renumberActiveEntrySchedule } from "./migrate-english-practice-data.derive.js";
import type { SourceActivePhrase, SourceMasteredPhrase } from "./migrate-english-practice-data.source-json.js";
import {
  existingPhraseBankAppearanceIds,
  existingPhraseBankEntryIds,
  matchExistingEntryId,
  type MigratedPhraseBankAppearanceInsertRow,
  type MigratedPhraseBankEntryInsertRow,
} from "./migrate-english-practice-data.repo.js";

export interface SampleMigratedEntry {
  phraseText: string;
  status: string;
  level: PracticeLevel;
  scheduledForSentenceCount: number | null;
}

export interface PhraseBankMigrationPlan {
  entryInsertRows: MigratedPhraseBankEntryInsertRow[];
  appearanceInsertRows: MigratedPhraseBankAppearanceInsertRow[];
  entriesToCreate: number;
  entriesAlreadyPresent: number;
  activeToCreate: number;
  masteredToCreate: number;
  appearancesAlreadyPresent: number;
  sampleEntry: SampleMigratedEntry | null;
}

// Decision 7 — best-effort interpolation between an active entry's `added`
// and `lastAttempt` dates (no per-appearance date exists in the source).
// Display/provenance-only column, confirmed never read back by any live
// scheduling logic.
function interpolateAppearanceDate(
  added: Date,
  lastAttempt: Date,
  index: number,
  total: number,
): Date {
  if (total <= 1) {
    return lastAttempt;
  }

  const t = index / (total - 1);

  return new Date(added.getTime() + (lastAttempt.getTime() - added.getTime()) * t);
}

function buildAppearanceRows(
  entry: SourceActivePhrase,
  phraseBankEntryId: string,
): MigratedPhraseBankAppearanceInsertRow[] {
  const added = new Date(entry.added);
  const lastAttempt = new Date(entry.lastAttempt);
  const history = entry.recycleSchedule.appearanceHistory;

  return history.map((appearance, index) => ({
    id: buildImportId("pba", `${entry.id}_${index}`),
    phraseBankEntryId,
    // Decision 2 — a synthetic sentinel, deliberately not built via
    // buildImportId/the `_import_` convention: this column is write-only
    // (never read back), so it never needs to resolve to a real phrases row.
    phraseId: `pbahist_${entry.id}_${index}`,
    sentenceCount: appearance.sentence,
    result: appearance.result,
    score: appearance.score,
    wasOverdue: appearance.wasOverdue,
    createdAt: interpolateAppearanceDate(added, lastAttempt, index, history.length),
  }));
}

// SCENARIO 2, 3, 7, 11, 12, Decision 16 — reads all pre-existing state up
// front, then walks active entries (existing-id skip → live-collision
// attach → fresh insert) and mastered entries (existing-id skip → always
// insert, never collision-checked) in one sequential pass each.
export async function planPhraseBankMigration(
  subjectId: string,
  pbeLevel: PracticeLevel,
  pack: Pack,
  active: SourceActivePhrase[],
  mastered: SourceMasteredPhrase[],
  postImportMaxForPbeLevel: number,
  db: DbExecutor,
): Promise<PhraseBankMigrationPlan> {
  const activeCandidateIds = active.map((a) => buildImportId("pbe", a.id));
  const masteredCandidateIds = mastered.map((m) => buildImportId("pbe", m.id));
  const existingEntryIds = await existingPhraseBankEntryIds(
    [...activeCandidateIds, ...masteredCandidateIds],
    db,
  );

  const entryInsertRows: MigratedPhraseBankEntryInsertRow[] = [];
  const appearanceCandidateRows: MigratedPhraseBankAppearanceInsertRow[] = [];
  let entriesToCreate = 0;
  let entriesAlreadyPresent = 0;
  let activeToCreate = 0;
  let masteredToCreate = 0;
  let sampleEntry: SampleMigratedEntry | null = null;

  // Sequential, not Promise.all — a duplicate phrase text within the source
  // JSON itself must see an entry this same loop already decided to create,
  // mirroring generate-phrase-batch.orchestrator.ts's own
  // linkOrCreateTargetPhrases precedent for the identical operation.
  for (const a of active) {
    const candidateId = buildImportId("pbe", a.id);

    if (existingEntryIds.has(candidateId)) {
      entriesAlreadyPresent += 1;
      appearanceCandidateRows.push(...buildAppearanceRows(a, candidateId));
      continue;
    }

    // SCENARIO 11 / Decision 10 — reuse the live app's own matcher; on a
    // match, never overwrite the live entry's own progress, only attach the
    // imported appearance history to it.
    const liveMatchId = await matchExistingEntryId(subjectId, pbeLevel, pack, a.phrase, db);

    if (liveMatchId) {
      entriesAlreadyPresent += 1;
      appearanceCandidateRows.push(...buildAppearanceRows(a, liveMatchId));
      continue;
    }

    const status = deriveActivePhraseBankStatus({
      masteryStage: a.recycleSchedule.masteryStage,
      mode: a.mode,
    });

    let lastCorrectAtSentenceCount: number | null = null;
    let scheduledForSentenceCount: number | null = null;

    if (status !== "new") {
      const renumbered = renumberActiveEntrySchedule(postImportMaxForPbeLevel);
      lastCorrectAtSentenceCount = renumbered.lastCorrectAtSentenceCount;
      scheduledForSentenceCount = renumbered.scheduledForSentenceCount;
    }

    entryInsertRows.push({
      id: candidateId,
      subjectId,
      level: pbeLevel,
      pack,
      phraseText: a.phrase,
      category: a.category,
      status,
      masteryStage: a.recycleSchedule.masteryStage,
      correctCountInCycle: a.recycleSchedule.correctCountInCycle,
      incorrectCountInCycle: a.recycleSchedule.incorrectCountInCycle,
      lastCorrectAtSentenceCount,
      lastCorrectDate: a.recycleSchedule.lastCorrectDate
        ? new Date(a.recycleSchedule.lastCorrectDate)
        : null,
      scheduledForSentenceCount,
      notes: a.notes ?? null,
      createdAt: new Date(a.added),
    });

    entriesToCreate += 1;
    activeToCreate += 1;

    // Prefer a struggling/practicing sample over a "new" one — it actually
    // shows the SCENARIO 3 schedule renumbering the sample line exists to
    // let a human sanity-check, rather than a row whose schedule fields are
    // trivially null.
    if (!sampleEntry || sampleEntry.status === "new") {
      sampleEntry = { phraseText: a.phrase, status, level: pbeLevel, scheduledForSentenceCount };
    }

    appearanceCandidateRows.push(...buildAppearanceRows(a, candidateId));
  }

  // Decision 16 — mastered imports never run the live-collision check and
  // always insert as their own row: the partial unique index excludes
  // status = 'mastered' entirely (no collision is even possible at the DB
  // level), and a mastered entry carries no appearanceHistory to attach to
  // another row anyway — silently dropping it on a text match would lose
  // the record entirely.
  for (const m of mastered) {
    const candidateId = buildImportId("pbe", m.id);

    if (existingEntryIds.has(candidateId)) {
      entriesAlreadyPresent += 1;
      continue;
    }

    entryInsertRows.push({
      id: candidateId,
      subjectId,
      level: pbeLevel,
      pack,
      phraseText: m.phrase,
      category: m.category,
      status: "mastered",
      masteryStage: 3,
      correctCountInCycle: 0,
      incorrectCountInCycle: 0,
      lastCorrectAtSentenceCount: null,
      lastCorrectDate: null,
      scheduledForSentenceCount: null,
      notes: m.notes ?? null,
      createdAt: new Date(m.added),
      masteredAt: new Date(m.masteredDate),
    });

    entriesToCreate += 1;
    masteredToCreate += 1;
  }

  const appearanceCandidateIds = appearanceCandidateRows.map((r) => r.id);
  const existingAppearances = await existingPhraseBankAppearanceIds(appearanceCandidateIds, db);
  const appearanceInsertRows = appearanceCandidateRows.filter((r) => !existingAppearances.has(r.id));

  return {
    entryInsertRows,
    appearanceInsertRows,
    entriesToCreate,
    entriesAlreadyPresent,
    activeToCreate,
    masteredToCreate,
    appearancesAlreadyPresent: appearanceCandidateRows.length - appearanceInsertRows.length,
    sampleEntry,
  };
}
