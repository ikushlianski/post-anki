import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SourceQueryPool } from "./migrate-english-practice-data.repo.js";

// Shared, pure fixture-data builders for
// migrate-english-practice-data.integration.test.ts (no live source Neon
// database exists in this build environment — that test file fabricates a
// throwaway source-shaped Postgres and seeds it with the builders below).
// Deliberately no 'pg'/drizzle import here: dependency-cruiser's
// "no-raw-sql-outside-db-layer" rule restricts opening a raw Postgres
// connection to apps/api/src/db/ and test files, so the throwaway-db
// helpers live inline in the *.integration.test.ts file instead.

// --- Fixture content ------------------------------------------------------
// Sized to match spec.md's Backend Definition of Done's own illustrative
// dry-run output exactly: 12 phrases (8 at B1_B2, 4 at A1_A2 — SCENARIO 10),
// 12 attempts, 4 active + 2 mastered phrase-bank entries, 9 appearances
// across the active entries (0 + 3 + 2 + 4).

export const FIXTURE_LEVEL = "B1_B2";
export const FIXTURE_SECONDARY_LEVEL = "A1_A2";

export interface FixtureSourcePhrase {
  id: string;
  batch_id: string;
  level: string;
  position: number;
  russian: string;
  reference_english: string;
  domain: string;
  created_at: string;
}

export interface FixtureSourceAttempt {
  id: string;
  phrase_id: string;
  user_answer: string;
  score: number;
  verdict: string;
  feedback: string;
  native_alternatives: string[];
  created_at: string;
}

function isoAt(daysOffset: number, hourOffset = 0): string {
  return new Date(Date.UTC(2026, 4, 1 + daysOffset, hourOffset)).toISOString();
}

export function buildFixtureSourcePhrases(): FixtureSourcePhrase[] {
  const domains = ["Tech", "SmallTalk", "Everyday"];
  const phrases: FixtureSourcePhrase[] = [];

  for (let i = 0; i < 8; i += 1) {
    phrases.push({
      id: randomUUID(),
      batch_id: randomUUID(),
      level: FIXTURE_LEVEL,
      position: (i % 10) + 1,
      russian: `Русская фраза Б1 ${i + 1}`,
      reference_english: `B1_B2 reference sentence ${i + 1}`,
      domain: domains[i % domains.length]!,
      created_at: isoAt(i),
    });
  }

  for (let i = 0; i < 4; i += 1) {
    phrases.push({
      id: randomUUID(),
      batch_id: randomUUID(),
      level: FIXTURE_SECONDARY_LEVEL,
      position: (i % 10) + 1,
      russian: `Русская фраза А1 ${i + 1}`,
      reference_english: `A1_A2 reference sentence ${i + 1}`,
      domain: domains[i % domains.length]!,
      created_at: isoAt(20 + i),
    });
  }

  return phrases;
}

export function buildFixtureSourceAttempts(phrases: FixtureSourcePhrase[]): FixtureSourceAttempt[] {
  return phrases.map((phrase, index) => ({
    id: randomUUID(),
    phrase_id: phrase.id,
    user_answer: `learner answer ${index + 1}`,
    score: 8,
    verdict: "Ok",
    feedback: "Nice work.",
    native_alternatives: [],
    created_at: phrase.created_at,
  }));
}

export interface FixtureActivePhrase {
  id: string;
  phrase: string;
  category: string;
  mode: "mixed" | "isolation";
  lastAttempt: string;
  added: string;
  notes?: string;
  recycleSchedule: {
    masteryStage: number;
    correctCountInCycle: number;
    incorrectCountInCycle: number;
    lastCorrectAtSentence: number | null;
    lastCorrectDate: string | null;
    scheduledForSentence: number | null;
    appearanceHistory: {
      sentence: number;
      result: "correct" | "incorrect";
      score: number;
      wasOverdue: boolean;
    }[];
  };
}

export interface FixtureMasteredPhrase {
  id: string;
  phrase: string;
  category: string;
  masteredDate: string;
  added: string;
  notes?: string;
}

export const FIXTURE_NEW_ENTRY_ID = "new-phrase";
export const FIXTURE_PRACTICING_ENTRY_ID = "practicing-phrase";
export const FIXTURE_STRUGGLING_ENTRY_ID = "struggling-phrase";
export const FIXTURE_PRACTICING_ENTRY_2_ID = "practicing-phrase-2";

export function buildFixtureActivePhrases(): FixtureActivePhrase[] {
  return [
    {
      id: FIXTURE_NEW_ENTRY_ID,
      phrase: "kick the bucket",
      category: "idioms",
      mode: "mixed",
      lastAttempt: "2026-06-01",
      added: "2026-06-01",
      recycleSchedule: {
        masteryStage: 0,
        correctCountInCycle: 0,
        incorrectCountInCycle: 0,
        lastCorrectAtSentence: null,
        lastCorrectDate: null,
        scheduledForSentence: null,
        appearanceHistory: [],
      },
    },
    {
      id: FIXTURE_PRACTICING_ENTRY_ID,
      phrase: "get the ball rolling",
      category: "idioms",
      mode: "mixed",
      lastAttempt: "2026-06-05",
      added: "2026-06-01",
      recycleSchedule: {
        masteryStage: 1,
        correctCountInCycle: 1,
        incorrectCountInCycle: 0,
        lastCorrectAtSentence: 5,
        lastCorrectDate: "2026-06-05",
        scheduledForSentence: 8,
        appearanceHistory: [
          { sentence: 1, result: "correct", score: 8, wasOverdue: false },
          { sentence: 3, result: "incorrect", score: 3, wasOverdue: false },
          { sentence: 5, result: "correct", score: 9, wasOverdue: true },
        ],
      },
    },
    // isolation checked before masteryStage (SCENARIO 2) — masteryStage is
    // nonzero here specifically to prove the isolation branch is checked
    // first, not merely "masteryStage === 0" happening to coincide.
    {
      id: FIXTURE_STRUGGLING_ENTRY_ID,
      phrase: "miss the boat",
      category: "idioms",
      mode: "isolation",
      lastAttempt: "2026-06-06",
      added: "2026-06-01",
      recycleSchedule: {
        masteryStage: 1,
        correctCountInCycle: 1,
        incorrectCountInCycle: 1,
        lastCorrectAtSentence: 4,
        lastCorrectDate: "2026-06-04",
        scheduledForSentence: 10,
        appearanceHistory: [
          { sentence: 2, result: "correct", score: 7, wasOverdue: false },
          { sentence: 4, result: "incorrect", score: 2, wasOverdue: true },
        ],
      },
    },
    {
      id: FIXTURE_PRACTICING_ENTRY_2_ID,
      phrase: "under the weather",
      category: "idioms",
      mode: "mixed",
      lastAttempt: "2026-06-07",
      added: "2026-06-01",
      recycleSchedule: {
        masteryStage: 2,
        correctCountInCycle: 2,
        incorrectCountInCycle: 0,
        lastCorrectAtSentence: 7,
        lastCorrectDate: "2026-06-07",
        scheduledForSentence: 14,
        appearanceHistory: [
          { sentence: 1, result: "correct", score: 8, wasOverdue: false },
          { sentence: 2, result: "correct", score: 9, wasOverdue: false },
          { sentence: 5, result: "correct", score: 7, wasOverdue: true },
          { sentence: 7, result: "correct", score: 10, wasOverdue: false },
        ],
      },
    },
  ];
}

export const FIXTURE_MASTERED_COLLISION_TEXT = "Break The Ice ";
export const FIXTURE_MASTERED_COLLISION_ID = "mastered-phrase-one";

export function buildFixtureMasteredPhrases(): FixtureMasteredPhrase[] {
  return [
    {
      id: FIXTURE_MASTERED_COLLISION_ID,
      phrase: FIXTURE_MASTERED_COLLISION_TEXT,
      category: "idioms",
      masteredDate: "2026-06-10",
      added: "2026-06-01",
      notes: "unprompted",
    },
    {
      id: "mastered-phrase-two",
      phrase: "spill the beans",
      category: "idioms",
      masteredDate: "2026-06-11",
      added: "2026-06-02",
    },
  ];
}

export async function seedSourceFixtureDb(
  pool: SourceQueryPool,
  level: string,
  phrases: FixtureSourcePhrase[],
  attempts: FixtureSourceAttempt[],
): Promise<void> {
  await pool.query(`INSERT INTO settings (id, level) VALUES (1, $1)`, [level]);

  for (const p of phrases) {
    await pool.query(
      `INSERT INTO phrases (id, batch_id, level, position, russian, reference_english, domain, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [p.id, p.batch_id, p.level, p.position, p.russian, p.reference_english, p.domain, p.created_at],
    );
  }

  for (const a of attempts) {
    await pool.query(
      `INSERT INTO attempts (id, phrase_id, user_answer, score, verdict, feedback, native_alternatives, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        a.id,
        a.phrase_id,
        a.user_answer,
        a.score,
        a.verdict,
        a.feedback,
        a.native_alternatives,
        a.created_at,
      ],
    );
  }
}

export async function writeFixtureLearningDir(
  active: FixtureActivePhrase[],
  mastered: FixtureMasteredPhrase[],
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "mepd-learning-"));

  await writeFile(path.join(dir, "active-phrases.json"), JSON.stringify({ phrases: active }));
  await writeFile(path.join(dir, "mastered-phrases.json"), JSON.stringify({ phrases: mastered }));
  // SCENARIO 8 proof surface — a curriculum/quiz file sitting right next to
  // the two real inputs, never read by the migration.
  await writeFile(path.join(dir, "quiz-bank.json"), JSON.stringify({ quizzes: ["should never be read"] }));

  return dir;
}

export async function removeFixtureLearningDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
