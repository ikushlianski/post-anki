import { z } from "zod";
import { getSubject } from "../subject/subject.repo.js";
import { listPhrasesForSubject } from "../practice/practice.repo.js";

export const GET_DECK_ITEMS_DEFAULT_LIMIT = 50;
export const GET_DECK_ITEMS_MAX_LIMIT = 200;

export const getDeckItemsInputSchema = z.object({
  subjectId: z.string().min(1).describe("Deck id, e.g. from list_decks"),
  limit: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      `Max items to return, default ${GET_DECK_ITEMS_DEFAULT_LIMIT}, clamped to ${GET_DECK_ITEMS_MAX_LIMIT}`,
    ),
  offset: z.number().int().min(0).optional().describe("Items to skip, default 0"),
});

export type GetDeckItemsInput = z.infer<typeof getDeckItemsInputSchema>;

export const getDeckItemsItemSchema = z.object({
  id: z.string(),
  russian: z.string(),
  referenceEnglish: z.string(),
  domain: z.string(),
  createdAt: z.string(),
});

export const getDeckItemsResultSchema = z.object({
  items: z.array(getDeckItemsItemSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type GetDeckItemsItem = z.infer<typeof getDeckItemsItemSchema>;
export type GetDeckItemsResult = z.infer<typeof getDeckItemsResultSchema>;

export type GetDeckItemsError = "not_found" | "not_a_deck";

// Returns an error tag instead of throwing for the two expected non-success
// cases; registerTool maps each to its own isError message.
export async function getDeckItems(
  input: GetDeckItemsInput,
): Promise<GetDeckItemsResult | { error: GetDeckItemsError }> {
  const subject = await getSubject(input.subjectId);

  if (!subject) {
    return { error: "not_found" };
  }

  if (subject.kind !== "language-practice") {
    return { error: "not_a_deck" };
  }

  const limit = Math.min(
    Math.max(input.limit ?? GET_DECK_ITEMS_DEFAULT_LIMIT, 0),
    GET_DECK_ITEMS_MAX_LIMIT,
  );
  const offset = Math.max(input.offset ?? 0, 0);

  const phrases = await listPhrasesForSubject(input.subjectId);
  const page = phrases.slice(offset, offset + limit);

  const items = page.map((phrase) => ({
    id: phrase.id,
    russian: phrase.russian,
    referenceEnglish: phrase.referenceEnglish,
    domain: phrase.domain,
    createdAt: phrase.createdAt.toISOString(),
  }));

  return {
    items,
    total: phrases.length,
    limit,
    offset,
  };
}
