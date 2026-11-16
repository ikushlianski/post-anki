import process from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import pg from "pg";
import { z } from "zod";
import { CARD_DEDUP_BORDERLINE_THRESHOLD } from "../src/card-dedup/card-dedup.config.ts";
import {
  buildPairsAmong,
  formatNearDuplicateReport,
  mergePairs,
  type EmbeddedCard,
  type NearDuplicateCard,
  type NearDuplicatePair,
} from "../src/card-dedup/card-dedup-near-duplicate-report.ts";
import { embedTexts } from "../src/shared/embeddings-client.ts";

const REPORT_PATH = resolve(import.meta.dirname, "../../../.planning/near-duplicate-cards/report.md");
const EMBED_BATCH = 100;

const argsSchema = z.object({ subject: z.string().min(1) });

interface CardRow {
  variant_id: string;
  bit_id: string;
  prompt: string;
  answer: string;
}

interface PairRow extends CardRow {
  other_variant_id: string;
  other_bit_id: string;
  other_prompt: string;
  other_answer: string;
  similarity: number | string;
}

const SCOPE_CTE = `
  WITH RECURSIVE tree AS (
    SELECT id FROM subjects WHERE id = $1
    UNION
    SELECT s.id FROM subjects s JOIN tree t ON s.parent_id = t.id
  ),
  cards AS (
    SELECT v.id AS variant_id, v.knowledge_bit_id AS bit_id, v.prompt, v.answer, v.embedding_vec
    FROM knowledge_bit_question_variants v
    JOIN knowledge_bits b ON b.id = v.knowledge_bit_id
    JOIN knowledge_sources ks ON ks.id = b.knowledge_source_id
    WHERE b.approval_state = 'approved'
      AND v.kind = 'basic'
      AND v.superseded_at IS NULL
      AND ks.subject_id IN (SELECT id FROM tree)
  )
`;

function toCard(row: CardRow): NearDuplicateCard {
  return { variantId: row.variant_id, bitId: row.bit_id, prompt: row.prompt, answer: row.answer };
}

async function resolveSubject(client: pg.Client, name: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM subjects WHERE parent_id IS NULL AND lower(name) = lower($1)",
    [name],
  );

  if (rows.length === 0) throw new Error(`top-level subject "${name}" not_found`);

  if (rows.length > 1) throw new Error(`top-level subject "${name}" ambiguous: ${JSON.stringify(rows)}`);

  return rows[0]!.id;
}

async function embeddedSelfJoin(client: pg.Client, subjectId: string): Promise<NearDuplicatePair[]> {
  const { rows } = await client.query<PairRow>(
    `${SCOPE_CTE}
    SELECT a.variant_id, a.bit_id, a.prompt, a.answer,
           b.variant_id AS other_variant_id, b.bit_id AS other_bit_id,
           b.prompt AS other_prompt, b.answer AS other_answer,
           1 - (a.embedding_vec <=> b.embedding_vec) AS similarity
    FROM cards a
    JOIN cards b ON a.variant_id < b.variant_id AND a.bit_id <> b.bit_id
    WHERE a.embedding_vec IS NOT NULL
      AND b.embedding_vec IS NOT NULL
      AND 1 - (a.embedding_vec <=> b.embedding_vec) >= $2`,
    [subjectId, CARD_DEDUP_BORDERLINE_THRESHOLD],
  );

  return rows.map((row) => ({
    similarity: Number(row.similarity),
    a: toCard(row),
    b: { variantId: row.other_variant_id, bitId: row.other_bit_id, prompt: row.other_prompt, answer: row.other_answer },
  }));
}

async function embedMissing(missing: NearDuplicateCard[]): Promise<EmbeddedCard[]> {
  const byId = new Map(missing.map((card) => [card.variantId, card]));
  const result: EmbeddedCard[] = [];

  for (let i = 0; i < missing.length; i += EMBED_BATCH) {
    const batch = missing.slice(i, i + EMBED_BATCH);
    const embedded = await embedTexts(batch.map((card) => ({ id: card.variantId, text: `${card.prompt}\n${card.answer}` })));

    for (const item of embedded) {
      const card = byId.get(item.id);

      if (card) result.push({ card, embedding: item.embedding });
    }
  }

  return result;
}

async function missingVersusStored(
  client: pg.Client,
  subjectId: string,
  fresh: EmbeddedCard[],
): Promise<NearDuplicatePair[]> {
  const pairs: NearDuplicatePair[] = [];

  for (const { card, embedding } of fresh) {
    const { rows } = await client.query<CardRow & { similarity: number | string }>(
      `${SCOPE_CTE}
      SELECT variant_id, bit_id, prompt, answer, 1 - (embedding_vec <=> $2::halfvec) AS similarity
      FROM cards
      WHERE embedding_vec IS NOT NULL
        AND bit_id <> $3
        AND 1 - (embedding_vec <=> $2::halfvec) >= $4`,
      [subjectId, `[${embedding.join(",")}]`, card.bitId, CARD_DEDUP_BORDERLINE_THRESHOLD],
    );

    for (const row of rows) pairs.push({ similarity: Number(row.similarity), a: card, b: toCard(row) });
  }

  return pairs;
}

async function main() {
  const { values } = parseArgs({ options: { subject: { type: "string", default: "Business" } } });
  const args = argsSchema.parse(values);
  const databaseUrl = z.string({ required_error: "DATABASE_URL is required" }).min(1).parse(process.env.DATABASE_URL);
  const client = new pg.Client({ connectionString: databaseUrl });

  await client.connect();

  try {
    await client.query("SET default_transaction_read_only = on");
    await client.query("BEGIN READ ONLY");

    const subjectId = await resolveSubject(client, args.subject);
    const { rows } = await client.query<CardRow & { has_embedding: boolean }>(
      `${SCOPE_CTE} SELECT variant_id, bit_id, prompt, answer, embedding_vec IS NOT NULL AS has_embedding FROM cards`,
      [subjectId],
    );
    const missing = rows.filter((row) => !row.has_embedding).map(toCard);
    const fresh = await embedMissing(missing);
    const pairs = mergePairs(
      await embeddedSelfJoin(client, subjectId),
      await missingVersusStored(client, subjectId, fresh),
      buildPairsAmong(fresh, CARD_DEDUP_BORDERLINE_THRESHOLD),
    );

    await client.query("ROLLBACK");

    const report = formatNearDuplicateReport({
      subject: args.subject,
      threshold: CARD_DEDUP_BORDERLINE_THRESHOLD,
      scannedCards: rows.length,
      embeddedInMemory: fresh.length,
      pairs,
    });

    await mkdir(dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, report);
    console.log(JSON.stringify({ scannedCards: rows.length, embeddedInMemory: fresh.length, pairs: pairs.length, report: REPORT_PATH }));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
