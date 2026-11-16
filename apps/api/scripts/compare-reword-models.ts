import process from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Agent } from "@mastra/core/agent";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { CARD_REWORDING_CANDIDATE_MODEL_IDS } from "../src/card-rewording/card-rewording.config.ts";
import {
  buildCardRewordingPrompt,
  CARD_REWORDING_INSTRUCTIONS,
  cardRewordingOutputSchema,
} from "../src/card-rewording/card-rewording.prompt.ts";
import { validateRewordedVersions } from "../src/card-rewording/card-rewording.validate.ts";
import { closeDb, getDb } from "../src/db/client.ts";
import { listDifficultPlainCards } from "../src/knowledge-bit/knowledge-bit-card-difficulty.repo.ts";
import { resolveAgentModel } from "../src/mastra/model.ts";
import { loadEnv } from "../src/shared/env.ts";

const REPORT_PATH = resolve(import.meta.dirname, "../../../.planning/difficult-card-versions/model-trial.md");

const argsSchema = z.object({
  subject: z.string().min(1),
  cards: z.coerce.number().int().min(1).max(10),
});

interface Trial {
  modelId: string;
  ms: number;
  error: string | null;
  raw: string[];
  kept: string[];
}

async function businessSubjectIds(subject: string): Promise<string[]> {
  const result = await getDb().execute<{ id: string }>(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM subjects WHERE parent_id IS NULL AND lower(name) = lower(${subject})
      UNION
      SELECT s.id FROM subjects s JOIN tree t ON s.parent_id = t.id
    )
    SELECT id FROM tree`);

  return result.rows.map((row) => row.id);
}

async function runTrial(modelId: string, card: { front: string; back: string }): Promise<Trial> {
  const agent = new Agent({
    id: "card-rewording-trial",
    name: "Card Rewording Trial",
    instructions: CARD_REWORDING_INSTRUCTIONS,
    model: resolveAgentModel(modelId, loadEnv().OPENROUTER_BASE_URL),
  });
  const started = Date.now();

  try {
    const result = await agent.generate(buildCardRewordingPrompt(card), {
      structuredOutput: { schema: cardRewordingOutputSchema },
    });
    const parsed = cardRewordingOutputSchema.parse(result.object);
    const kept = validateRewordedVersions(card, parsed.versions);

    return {
      modelId,
      ms: Date.now() - started,
      error: null,
      raw: parsed.versions.map((v) => `${v.angle}: ${v.prompt}`),
      kept: kept.map((v) => `${v.angle}: ${v.prompt}`),
    };
  } catch (err) {
    return { modelId, ms: Date.now() - started, error: String(err).slice(0, 200), raw: [], kept: [] };
  }
}

function render(subject: string, rows: { card: { front: string; back: string }; trials: Trial[] }[]): string {
  const lines = [`# Rewording model trial (${subject}, ${new Date().toISOString().slice(0, 10)})`, ""];

  for (const modelId of CARD_REWORDING_CANDIDATE_MODEL_IDS) {
    const trials = rows.map((row) => row.trials.find((t) => t.modelId === modelId)!);
    const kept = trials.reduce((sum, t) => sum + t.kept.length, 0);
    const errors = trials.filter((t) => t.error).length;
    const avgMs = Math.round(trials.reduce((sum, t) => sum + t.ms, 0) / trials.length);

    lines.push(`- ${modelId}: ${kept} versions kept after validation, ${errors} errors, ${avgMs} ms average`);
  }

  for (const [index, row] of rows.entries()) {
    lines.push("", `## Card ${index + 1}`, "", `Front: ${row.card.front}`, "", `Back: ${row.card.back}`);

    for (const trial of row.trials) {
      lines.push("", `### ${trial.modelId}`);

      if (trial.error) {
        lines.push(`- error: ${trial.error}`);
      }

      for (const version of trial.raw) {
        lines.push(`- ${trial.kept.includes(version) ? "kept" : "dropped"}: ${version}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const { values } = parseArgs({
    options: { subject: { type: "string", default: "Business" }, cards: { type: "string", default: "5" } },
  });
  const args = argsSchema.parse(values);
  const subjectIds = await businessSubjectIds(args.subject);
  const cards = await listDifficultPlainCards(getDb(), { subjectIds, limit: args.cards });
  const rows = [];

  for (const card of cards) {
    const trials = [];

    for (const modelId of CARD_REWORDING_CANDIDATE_MODEL_IDS) {
      trials.push(await runTrial(modelId, card));
    }

    rows.push({ card, trials });
  }

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, render(args.subject, rows));
  console.log(JSON.stringify({ cards: rows.length, report: REPORT_PATH }));
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
