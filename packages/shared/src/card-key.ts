import { z } from "zod";

export const INDEPENDENT_CARD_KINDS = ["cloze", "list_step", "list_next", "list_overview"] as const;

export type IndependentCardKind = (typeof INDEPENDENT_CARD_KINDS)[number];

export const isIndependentCardKind = (kind: string): kind is IndependentCardKind =>
  (INDEPENDENT_CARD_KINDS as readonly string[]).includes(kind);

export const cardKeyFor = ({ kind, order }: { kind: string; order: number }): string =>
  isIndependentCardKind(kind) ? `${kind}:${order}` : "";

export const cardKeySchema = z.string().regex(/^(|(cloze|list_step|list_next|list_overview):\d+)$/);

export const buriedSiblingSchema = z.object({
  cardKey: cardKeySchema,
  prevBuriedUntil: z.string().nullable(),
  buriedUntil: z.string(),
  createdRow: z.boolean(),
});

export type BuriedSibling = z.infer<typeof buriedSiblingSchema>;
