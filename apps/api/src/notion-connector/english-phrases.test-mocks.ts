import { vi } from "vitest";
import type { EnglishPhrasesDeps, EnglishPhrasesOptions } from "./english-phrases.types.js";
import type { PhraseBlock } from "./phrase-key.js";

export const baseOptions: EnglishPhrasesOptions = {
  connector: "english-phrases-3",
  pageId: "root",
  maxWords: 10,
  maxPhrases: 10,
  recursive: true,
  deleteAfterImport: true,
  dryRun: false,
};

export function bullet(id: string, text: string, hasChildren = false): PhraseBlock {
  return { id, type: "bulleted_list_item", text, hasChildren };
}

export function childPage(id: string): PhraseBlock {
  return { id, type: "child_page", text: "", hasChildren: true };
}

export function makeDeps(source: PhraseBlock[] | Record<string, PhraseBlock[]>, existing: Record<string, string> = {}, pageSize = 100) {
  const tree = Array.isArray(source) ? { root: source } : source;
  const calls: string[] = [];
  const filedKeys = new Set<string>();
  const deps = {
    listBlocks: vi.fn(async (parentId: string, cursor: string | null) => {
      const all = tree[parentId] ?? [];
      const start = cursor ? Number(cursor) : 0;
      const end = start + pageSize;

      return { blocks: all.slice(start, end), nextCursor: end < all.length ? String(end) : null };
    }),
    findExisting: vi.fn(async (texts: string[]) => {
      const found = new Map<string, string>();

      for (const text of texts) {
        const id = existing[text];

        if (id) {
          found.set(text, id);
        }
      }

      return found;
    }),
    fileNote: vi.fn(async (key: string) => {
      calls.push(`file:${key}`);
      const created = !filedKeys.has(key);

      filedKeys.add(key);

      return { sourceId: `ks-${key}`, created };
    }),
    logImport: vi.fn(async (entry: { notionBlockId: string }) => {
      calls.push(`log:${entry.notionBlockId}`);

      return `log-${entry.notionBlockId}`;
    }),
    markDeleted: vi.fn(async () => undefined),
    deleteBlock: vi.fn(async (id: string) => {
      calls.push(`delete:${id}`);
    }),
    now: () => new Date("2026-11-21T07:00:00Z"),
  } satisfies EnglishPhrasesDeps;

  return { deps, calls };
}
