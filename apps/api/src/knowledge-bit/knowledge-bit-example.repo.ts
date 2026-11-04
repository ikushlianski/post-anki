import { eq } from "drizzle-orm";
import { EXAMPLE_AI_MAX_GENERATIONS } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits } from "../db/schema.js";

export const EXAMPLE_ALLOWED_STATES = ["pending", "inbox", "chat", "approved"];

export interface KnowledgeBitExampleState {
  body: string;
  background: string | null;
  approvalState: string;
  exampleAiGeneratedAt: Date | null;
  exampleAiCount: number;
}

export type ExampleGate = "not_found" | "blocked" | "limit_reached" | "example_exists" | null;

export function checkExampleGate(state: KnowledgeBitExampleState | null, overwrite: boolean): ExampleGate {
  if (!state) {
    return "not_found";
  }

  if (!EXAMPLE_ALLOWED_STATES.includes(state.approvalState)) {
    return "blocked";
  }

  if (state.exampleAiCount >= EXAMPLE_AI_MAX_GENERATIONS) {
    return "limit_reached";
  }

  const humanText = (state.background ?? "").trim() !== "" && state.exampleAiGeneratedAt === null;

  return humanText && !overwrite ? "example_exists" : null;
}

export async function getKnowledgeBitExampleState(
  id: string,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitExampleState | null> {
  const row = (
    await db
      .select({
        body: knowledgeBits.body,
        background: knowledgeBits.background,
        approvalState: knowledgeBits.approvalState,
        exampleAiGeneratedAt: knowledgeBits.exampleAiGeneratedAt,
        exampleAiCount: knowledgeBits.exampleAiCount,
      })
      .from(knowledgeBits)
      .where(eq(knowledgeBits.id, id))
      .limit(1)
  )[0];

  return row ?? null;
}

export type WriteExampleResult =
  | { ok: true; previousExample: string | null; exampleAiGeneratedAt: Date; generationsLeft: number }
  | { ok: false; reason: Exclude<ExampleGate, null> };

export async function writeKnowledgeBitExample(
  id: string,
  example: string,
  overwrite: boolean,
  db: DbExecutor = getDb(),
): Promise<WriteExampleResult> {
  return db.transaction(async (tx) => {
    const current = (
      await tx
        .select({
          body: knowledgeBits.body,
          background: knowledgeBits.background,
          approvalState: knowledgeBits.approvalState,
          exampleAiGeneratedAt: knowledgeBits.exampleAiGeneratedAt,
          exampleAiCount: knowledgeBits.exampleAiCount,
        })
        .from(knowledgeBits)
        .where(eq(knowledgeBits.id, id))
        .for("update")
    )[0];
    const gate = checkExampleGate(current ?? null, overwrite);

    if (gate !== null || !current) {
      return { ok: false as const, reason: gate ?? ("not_found" as const) };
    }

    const exampleAiGeneratedAt = new Date();
    const count = current.exampleAiCount + 1;

    await tx
      .update(knowledgeBits)
      .set({ background: example, exampleAiGeneratedAt, exampleAiCount: count })
      .where(eq(knowledgeBits.id, id));

    return {
      ok: true as const,
      previousExample: current.background,
      exampleAiGeneratedAt,
      generationsLeft: EXAMPLE_AI_MAX_GENERATIONS - count,
    };
  });
}
