import { cardTextKey } from "./knowledge-bit-card-text-key.js";

export const CARD_KEY_BACKFILL_BATCH = 1000;

export interface UnkeyedVariant {
  id: string;
  prompt: string;
  answer: string;
}

export interface CardKeyBackfillClient {
  listUnkeyed: (afterId: string | null, limit: number) => Promise<UnkeyedVariant[]>;
  setKeys: (rows: { id: string; cardKey: string }[]) => Promise<void>;
}

export function parseCardKeyBackfillArgs(argv: readonly string[]) {
  return { apply: argv.includes("--apply"), allowRemote: argv.includes("--allow-remote") };
}

export async function runCardKeyBackfill(
  client: CardKeyBackfillClient,
  options: { apply: boolean; batchSize?: number },
): Promise<number> {
  const batchSize = options.batchSize ?? CARD_KEY_BACKFILL_BATCH;
  let afterId: string | null = null;
  let total = 0;

  for (;;) {
    const rows = await client.listUnkeyed(afterId, batchSize);

    if (rows.length === 0) {
      return total;
    }

    if (options.apply) {
      await client.setKeys(rows.map((row) => ({ id: row.id, cardKey: cardTextKey(row.prompt, row.answer) })));
    }

    total += rows.length;
    afterId = rows[rows.length - 1]?.id ?? null;
  }
}
