import { z } from "zod";
import { listActiveVariantsForBits } from "../knowledge-source/knowledge-source-mcp.repo.js";
import { deriveOverviewState } from "../knowledge-bit/knowledge-bit-overview-state.js";
import { listCardRowsByIds } from "./card-read.repo.js";
import { subjectPathsById, tagNamesByCardId } from "./card-view.js";
import { buildSourceLabel } from "./knowledge-source-label.js";

export const getCardsInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100).describe("Card (knowledge bit) ids, 1 to 100"),
});

export const getCardInputSchema = z.object({ id: z.string().min(1).describe("Card (knowledge bit) id") });

const variantSchema = z.object({
  kind: z.string(),
  front: z.string(),
  back: z.string(),
  clozeText: z.string().nullable(),
});

const scheduleSchema = z.object({
  state: z.string().describe("new, learning, review, relearning, suspended or buried"),
  phase: z.string(),
  dueAt: z.string(),
  intervalDays: z.number(),
  lapses: z.number().int(),
  reviewCount: z.number().int(),
  lastReviewedAt: z.string().nullable(),
});

export const cardSchema = z.object({
  id: z.string(),
  status: z.string().describe("approved, pending, rejected, ..."),
  variants: z.array(variantSchema),
  subject: z.object({ id: z.string(), path: z.string() }).nullable(),
  tags: z.array(z.string()),
  suspended: z.boolean(),
  schedule: scheduleSchema.nullable().describe("null while the card has never been studied"),
  sourceTitle: z.string().nullable(),
});

export const getCardsResultSchema = z.object({ cards: z.array(cardSchema), notFound: z.array(z.string()) });

export type GetCardsInput = z.infer<typeof getCardsInputSchema>;
export type GetCardsResult = z.infer<typeof getCardsResultSchema>;

export async function getCards(input: GetCardsInput, now: Date = new Date()): Promise<GetCardsResult> {
  const ids = [...new Set(input.ids)];
  const rows = await listCardRowsByIds(ids);
  const found = rows.map((row) => row.id);
  const [variants, paths, tags] = await Promise.all([
    listActiveVariantsForBits(found),
    subjectPathsById(),
    tagNamesByCardId(found),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const cards = ids.flatMap((id) => {
    const row = byId.get(id);

    if (!row) {
      return [];
    }

    const scheduled = row.scheduled !== null;
    const source = row.sourceId ? buildSourceLabel({ summary: row.sourceSummary, rawText: row.sourceRawText }) : null;

    return [
      {
        id,
        status: row.approvalState,
        variants: variants
          .filter((variant) => variant.knowledgeBitId === id)
          .map((v) => ({ kind: v.kind, front: v.prompt, back: v.answer, clozeText: v.sentence })),
        subject: row.subjectId ? { id: row.subjectId, path: paths.get(row.subjectId) ?? row.subjectId } : null,
        tags: tags.get(id) ?? [],
        suspended: row.suspendedAt !== null,
        schedule:
          scheduled && row.dueAt
            ? {
                state: deriveOverviewState(
                  { phase: row.phase ?? "review", suspendedAt: row.suspendedAt, buriedUntil: row.buriedUntil },
                  now,
                ),
                phase: row.phase ?? "review",
                dueAt: row.dueAt.toISOString(),
                intervalDays: row.intervalDays ?? 0,
                lapses: row.lapses ?? 0,
                reviewCount: row.reviewCount ?? 0,
                lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
              }
            : null,
        sourceTitle: source,
      },
    ];
  });

  return { cards, notFound: ids.filter((id) => !byId.has(id)) };
}

export async function getCard(input: z.infer<typeof getCardInputSchema>) {
  const result = await getCards({ ids: [input.id] });
  const card = result.cards[0];

  return card ? { card } : { error: "not_found" as const };
}
