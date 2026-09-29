import { z } from "zod";
import { listSubjects } from "../subject/subject.repo.js";

export const LIST_DECKS_DEFAULT_LIMIT = 50;
export const LIST_DECKS_MAX_LIMIT = 200;

export const listDecksInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(`Max items to return, default ${LIST_DECKS_DEFAULT_LIMIT}, clamped to ${LIST_DECKS_MAX_LIMIT}`),
  offset: z.number().int().min(0).optional().describe("Items to skip, default 0"),
});

export type ListDecksInput = z.infer<typeof listDecksInputSchema>;

export const listDecksItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});

export const listDecksResultSchema = z.object({
  items: z.array(listDecksItemSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type ListDecksItem = z.infer<typeof listDecksItemSchema>;
export type ListDecksResult = z.infer<typeof listDecksResultSchema>;

// Decks are subjects with kind "language-practice"; filter before paging so
// `total` reflects the filtered set.
export async function listDecks(input: ListDecksInput): Promise<ListDecksResult> {
  const limit = Math.min(
    Math.max(input.limit ?? LIST_DECKS_DEFAULT_LIMIT, 0),
    LIST_DECKS_MAX_LIMIT,
  );
  const offset = Math.max(input.offset ?? 0, 0);

  const subjects = await listSubjects();
  const decks = subjects.filter((subject) => subject.kind === "language-practice");

  const items = decks.slice(offset, offset + limit).map((deck) => ({
    id: deck.id,
    name: deck.name,
    description: deck.description ?? null,
  }));

  return {
    items,
    total: decks.length,
    limit,
    offset,
  };
}
