import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// SCENARIO 8 — only these two files are ever read from SOURCE_LEARNING_DIR.
// quiz-bank.json, sentences-30-40*.json, work-phrases-advanced.json, and
// index.json (Decision 1, Decision 11) are never touched.
const ACTIVE_PHRASES_FILE = "active-phrases.json";
const MASTERED_PHRASES_FILE = "mastered-phrases.json";

const sourceAppearanceSchema = z.object({
  sentence: z.number(),
  result: z.enum(["correct", "incorrect"]),
  score: z.number(),
  wasOverdue: z.boolean(),
});

const sourceRecycleScheduleSchema = z.object({
  masteryStage: z.number().int().min(0).max(3),
  correctCountInCycle: z.number(),
  incorrectCountInCycle: z.number(),
  lastCorrectAtSentence: z.number().nullable(),
  lastCorrectDate: z.string().nullable(),
  scheduledForSentence: z.number().nullable(),
  appearanceHistory: z.array(sourceAppearanceSchema),
});

const sourceActivePhraseSchema = z.object({
  id: z.string().min(1),
  phrase: z.string().min(1),
  category: z.string(),
  mode: z.enum(["mixed", "isolation"]),
  lastAttempt: z.string(),
  added: z.string(),
  notes: z.string().optional(),
  recycleSchedule: sourceRecycleScheduleSchema,
});

const sourceMasteredPhraseSchema = z.object({
  id: z.string().min(1),
  phrase: z.string().min(1),
  category: z.string(),
  masteredDate: z.string(),
  added: z.string(),
  notes: z.string().optional(),
});

const activePhraseFileSchema = z.object({ phrases: z.array(sourceActivePhraseSchema) });
const masteredPhraseFileSchema = z.object({ phrases: z.array(sourceMasteredPhraseSchema) });

export type SourceActivePhrase = z.infer<typeof sourceActivePhraseSchema>;
export type SourceMasteredPhrase = z.infer<typeof sourceMasteredPhraseSchema>;

export interface SourcePhraseBankJson {
  active: SourceActivePhrase[];
  mastered: SourceMasteredPhrase[];
}

async function readJsonFile(filePath: string): Promise<unknown> {
  let raw: string;

  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `migrate-english-practice-data: cannot read source JSON file at ${filePath} — ${(err as Error).message}`,
    );
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `migrate-english-practice-data: ${filePath} is not valid JSON — ${(err as Error).message}`,
    );
  }
}

// SCENARIO 4 / Decision 12 — a slug id appearing in both files would make the
// second entry's existing-row check silently treat it as an idempotent
// skip, indistinguishable from a legitimate re-run. Fails loudly, naming the
// colliding id(s), before any writes happen.
function assertNoCrossFileIdCollision(
  active: SourceActivePhrase[],
  mastered: SourceMasteredPhrase[],
): void {
  const activeIds = new Set(active.map((p) => p.id));
  const collisions = mastered.filter((p) => activeIds.has(p.id)).map((p) => p.id);

  if (collisions.length > 0) {
    throw new Error(
      `migrate-english-practice-data: slug id(s) appear in both ${ACTIVE_PHRASES_FILE} and ` +
        `${MASTERED_PHRASES_FILE}: ${collisions.join(", ")}`,
    );
  }
}

export async function readSourcePhraseBankJson(learningDir: string): Promise<SourcePhraseBankJson> {
  const activeRaw = await readJsonFile(path.join(learningDir, ACTIVE_PHRASES_FILE));
  const masteredRaw = await readJsonFile(path.join(learningDir, MASTERED_PHRASES_FILE));

  const active = activePhraseFileSchema.parse(activeRaw).phrases;
  const mastered = masteredPhraseFileSchema.parse(masteredRaw).phrases;

  assertNoCrossFileIdCollision(active, mastered);

  return { active, mastered };
}
