import type { Pack, PracticeLevel } from "@post-anki/shared";
import type { DbExecutor } from "../db/client.js";
import { assignSequenceNumbersByCreatedAt, buildImportId } from "./migrate-english-practice-data.derive.js";
import {
  existingAttemptIds,
  existingPhraseIds,
  nextSequenceBase,
  type MigratedAttemptInsertRow,
  type MigratedPhraseInsertRow,
  type SourceAttemptRow,
  type SourcePhraseRow,
} from "./migrate-english-practice-data.repo.js";

const PACK: Pack = "General";

export interface PhraseAttemptMigrationPlan {
  phraseInsertRows: MigratedPhraseInsertRow[];
  attemptInsertRows: MigratedAttemptInsertRow[];
  // The post-import ceiling sequenceNumber per level, computed purely from
  // this plan's own numbers (base + count of new phrases at that level) —
  // never re-queried. This is what lets SCENARIO 12's ordering be a
  // structural fact rather than a race on transaction visibility: the
  // phrase-bank plan step (migrate-english-practice-data.plan-phrase-bank.ts)
  // reads this map instead of touching the database again.
  postImportMaxByLevel: Map<PracticeLevel, number>;
  phrasesToCreate: number;
  phrasesAlreadyPresent: number;
  attemptsAlreadyPresent: number;
}

function groupByLevel(rows: SourcePhraseRow[]): Map<PracticeLevel, SourcePhraseRow[]> {
  const groups = new Map<PracticeLevel, SourcePhraseRow[]>();

  for (const row of rows) {
    const existing = groups.get(row.level);

    if (existing) {
      existing.push(row);
    } else {
      groups.set(row.level, [row]);
    }
  }

  return groups;
}

// SCENARIO 1, SCENARIO 10 — phrases are grouped and renumbered independently
// per level, continuing from that level's own real nextSequenceBase.
// Attempts resolve their target phraseId deterministically from the source
// phrase id (buildImportId), so no lookup map back to phraseInsertRows is
// needed.
export async function planPhraseAndAttemptMigration(
  subjectId: string,
  sourcePhrases: SourcePhraseRow[],
  sourceAttempts: SourceAttemptRow[],
  db: DbExecutor,
): Promise<PhraseAttemptMigrationPlan> {
  const phrasesByLevel = groupByLevel(sourcePhrases);
  const phraseInsertRows: MigratedPhraseInsertRow[] = [];
  const postImportMaxByLevel = new Map<PracticeLevel, number>();
  let phrasesToCreate = 0;
  let phrasesAlreadyPresent = 0;

  for (const [level, group] of phrasesByLevel) {
    const candidateIds = group.map((p) => buildImportId("phrase", p.id));
    const existing = await existingPhraseIds(candidateIds, db);
    const newPhrases = group.filter((p) => !existing.has(buildImportId("phrase", p.id)));

    phrasesAlreadyPresent += group.length - newPhrases.length;

    const base = await nextSequenceBase(subjectId, level, PACK, db);
    const withSequence = assignSequenceNumbersByCreatedAt(
      newPhrases.map((p) => ({ ...p, createdAt: p.created_at.toISOString() })),
      base,
    );

    phrasesToCreate += withSequence.length;
    postImportMaxByLevel.set(level, base + newPhrases.length);

    for (const p of withSequence) {
      phraseInsertRows.push({
        id: buildImportId("phrase", p.id),
        subjectId,
        batchId: `import_${p.batch_id}`,
        level,
        pack: PACK,
        position: p.position,
        russian: p.russian,
        referenceEnglish: p.reference_english,
        domain: p.domain,
        targetPhraseBankEntryId: null,
        sequenceNumber: p.sequenceNumber,
        createdAt: p.created_at,
      });
    }
  }

  const attemptCandidateIds = sourceAttempts.map((a) => buildImportId("attempt", a.id));
  const existingAttempts = await existingAttemptIds(attemptCandidateIds, db);
  const newAttempts = sourceAttempts.filter(
    (a) => !existingAttempts.has(buildImportId("attempt", a.id)),
  );

  const attemptInsertRows: MigratedAttemptInsertRow[] = newAttempts.map((a) => ({
    id: buildImportId("attempt", a.id),
    subjectId,
    phraseId: buildImportId("phrase", a.phrase_id),
    userAnswer: a.user_answer,
    score: a.score,
    verdict: a.verdict,
    feedback: a.feedback,
    nativeAlternatives: a.native_alternatives,
    createdAt: a.created_at,
  }));

  return {
    phraseInsertRows,
    attemptInsertRows,
    postImportMaxByLevel,
    phrasesToCreate,
    phrasesAlreadyPresent,
    attemptsAlreadyPresent: existingAttempts.size,
  };
}
