import { z } from "zod";
import {
  findBitsByExactBody,
  findReadyCardsByExactText,
  findSourcesByExactTextOrKey,
  type DuplicateSourceRow,
} from "../knowledge-source/knowledge-source-duplicate-lookup.repo.js";
import { normalizedMatchKey } from "../knowledge-source/normalize-duplicate-text.js";
import { buildSourceLabel } from "./knowledge-source-label.js";

export const CHECK_DUPLICATES_MAX_DRAFTS = 100;
export const CHECK_DUPLICATES_MAX_MATCHES_PER_KIND = 5;
export const CHECK_DUPLICATES_EXCERPT_LENGTH = 160;

export const checkDuplicatesInputSchema = z.object({
  drafts: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(20000).describe("Draft note text, matched exactly and, when 12+ letters/digits long, ignoring case, whitespace and punctuation"),
        key: z
          .string()
          .regex(/^[a-z0-9:_-]{8,80}$/)
          .optional()
          .describe("Import key the note would be submitted with, e.g. anki:<hash>; matched exactly"),
      }),
    )
    .min(1)
    .max(CHECK_DUPLICATES_MAX_DRAFTS),
  subjectId: z.string().min(1).optional().describe("Only look for matches filed under this subject"),
});

export type CheckDuplicatesInput = z.infer<typeof checkDuplicatesInputSchema>;

const matchedBySchema = z.enum(["text", "key"]);
const matchSchema = z.enum(["exact", "normalized"]);

export const checkDuplicatesResultSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().int(),
      exists: z.boolean(),
      sources: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          subjectId: z.string().nullable(),
          subjectName: z.string().nullable(),
          excerpt: z.string(),
          matchedBy: matchedBySchema,
          match: matchSchema,
        }),
      ),
      knowledgeBits: z.array(
        z.object({ id: z.string(), sourceId: z.string(), excerpt: z.string(), match: matchSchema }),
      ),
      cards: z.array(z.object({ id: z.string(), topicId: z.string(), excerpt: z.string(), match: matchSchema })),
    }),
  ),
});

export type CheckDuplicatesResult = z.infer<typeof checkDuplicatesResultSchema>;

function excerptOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();

  return flat.length <= CHECK_DUPLICATES_EXCERPT_LENGTH
    ? flat
    : `${flat.slice(0, CHECK_DUPLICATES_EXCERPT_LENGTH).trimEnd()}…`;
}

type MatchKind = "exact" | "normalized";

function groupBy<T>(rows: T[], valueOf: (row: T) => string | null): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const value = valueOf(row);

    if (value !== null) {
      grouped.set(value, [...(grouped.get(value) ?? []), row]);
    }
  }

  return grouped;
}

interface TextIndex<T> {
  exact: Map<string, T[]>;
  normalized: Map<string, T[]>;
}

function indexByText<T>(rows: T[], textOf: (row: T) => string | null): TextIndex<T> {
  return {
    exact: groupBy(rows, textOf),
    normalized: groupBy(rows, (row) => {
      const text = textOf(row);

      return text === null ? null : normalizedMatchKey(text);
    }),
  };
}

function lookup<T>(index: TextIndex<T>, text: string, idOf: (row: T) => string): { row: T; match: MatchKind }[] {
  const found = new Map<string, { row: T; match: MatchKind }>();

  for (const row of index.exact.get(text) ?? []) {
    found.set(idOf(row), { row, match: "exact" });
  }

  const key = normalizedMatchKey(text);

  for (const row of key === null ? [] : (index.normalized.get(key) ?? [])) {
    if (!found.has(idOf(row))) {
      found.set(idOf(row), { row, match: "normalized" });
    }
  }

  return [...found.values()];
}

// Exact text and exact import key, plus a normalized text match (case, whitespace and punctuation ignored) for drafts of 12+ normalized characters.
export async function checkDuplicates(input: CheckDuplicatesInput): Promise<CheckDuplicatesResult> {
  const texts = [...new Set(input.drafts.map((d) => d.text))];
  const normalizedTexts = [
    ...new Set(texts.flatMap((text) => {
      const key = normalizedMatchKey(text);

      return key === null ? [] : [key];
    })),
  ];
  const keys = [...new Set(input.drafts.flatMap((d) => (d.key === undefined ? [] : [d.key])))];
  const [sourceRows, bitRows, cardRows] = await Promise.all([
    findSourcesByExactTextOrKey(texts, keys, input.subjectId, normalizedTexts),
    findBitsByExactBody(texts, input.subjectId, normalizedTexts),
    findReadyCardsByExactText(texts, input.subjectId, normalizedTexts),
  ]);
  const sourcesByKey = groupBy(sourceRows, (r) => r.importKey);
  const sourcesByText = indexByText(
    sourceRows.filter((r) => r.rawText !== null),
    (r) => r.rawText,
  );
  const bitsByText = indexByText(bitRows, (r) => r.body);
  const cardsByText = indexByText(cardRows, (r) => r.matchedText);
  const cap = CHECK_DUPLICATES_MAX_MATCHES_PER_KIND;

  return {
    items: input.drafts.map((draft, index) => {
      const matched = new Map<string, { row: DuplicateSourceRow; matchedBy: "text" | "key"; match: MatchKind }>();

      for (const row of draft.key === undefined ? [] : (sourcesByKey.get(draft.key) ?? [])) {
        matched.set(row.id, { row, matchedBy: "key", match: "exact" });
      }

      for (const { row, match } of lookup(sourcesByText, draft.text, (r) => r.id)) {
        if (!matched.has(row.id)) {
          matched.set(row.id, { row, matchedBy: "text", match });
        }
      }

      const sources = [...matched.values()].slice(0, cap).map(({ row, matchedBy, match }) => ({
        id: row.id,
        label: buildSourceLabel(row),
        subjectId: row.subjectId,
        subjectName: row.subjectName,
        excerpt: excerptOf(row.rawText ?? ""),
        matchedBy,
        match,
      }));
      const knowledgeBits = lookup(bitsByText, draft.text, (r) => r.id)
        .slice(0, cap)
        .map(({ row, match }) => ({ id: row.id, sourceId: row.knowledgeSourceId, excerpt: excerptOf(row.body), match }));
      const cards = lookup(cardsByText, draft.text, (r) => r.cardId)
        .slice(0, cap)
        .map(({ row, match }) => ({ id: row.cardId, topicId: row.topicId, excerpt: excerptOf(row.matchedText), match }));

      return {
        index,
        exists: matched.size > 0 || knowledgeBits.length > 0 || cards.length > 0,
        sources,
        knowledgeBits,
        cards,
      };
    }),
  };
}
