import { z } from "zod";
import type { BatchFileStore } from "./batch-file-store.js";
import type { BatchSession } from "./batch-session.js";

export const getNextBatchInputSchema = z.object({
  size: z.number().int().min(1).max(50).default(10).describe("Notes per batch, 1 to 50, default 10"),
});

export const batchNoteSchema = z.object({
  hash: z.string(),
  deck: z.string().nullable(),
  front: z.string(),
  back: z.string(),
  rawText: z.string(),
  isCloze: z.boolean(),
});

export const getNextBatchResultSchema = z.object({
  batchId: z.string(),
  remaining: z.number(),
  notes: z.array(batchNoteSchema),
});

export const confirmBatchInputSchema = z.object({
  batchId: z.string().min(1).describe("Id returned by get_next_batch"),
});

export const confirmBatchResultSchema = z.object({
  removed: z.number(),
  remaining: z.number(),
});

export const statusInputSchema = z.object({});

export const statusResultSchema = z.object({
  file: z.string(),
  backupExists: z.boolean(),
  remaining: z.number(),
  pendingBatches: z.number(),
});

export type GetNextBatchResult = z.infer<typeof getNextBatchResultSchema>;
export type ConfirmBatchResult = z.infer<typeof confirmBatchResultSchema>;
export type StatusResult = z.infer<typeof statusResultSchema>;

export type ConfirmOutcome =
  | { ok: true; result: ConfirmBatchResult }
  | { ok: false; message: string };

export type AnkiBatchTools = {
  getNextBatch(size: number): Promise<GetNextBatchResult>;
  confirmBatch(batchId: string): Promise<ConfirmOutcome>;
  status(): Promise<StatusResult>;
};

export function createAnkiBatchTools(
  filePath: string,
  store: BatchFileStore,
  session: BatchSession,
): AnkiBatchTools {
  return {
    async getNextBatch(size) {
      await store.ensureBackup();

      const { notes } = await store.read();
      const taken = session.openHashes();
      const picked = [];

      for (const note of notes) {
        if (picked.length >= size) break;

        if (taken.has(note.hash)) continue;

        taken.add(note.hash);
        picked.push(note);
      }

      const batchId = picked.length > 0 ? session.open(picked.map((note) => note.hash)) : "";

      return {
        batchId,
        remaining: notes.length,
        notes: picked.map(({ hash, deck, front, back, rawText, isCloze }) => ({
          hash,
          deck,
          front,
          back,
          rawText,
          isCloze,
        })),
      };
    },

    async confirmBatch(batchId) {
      const outcome = session.confirm(batchId);

      if (!outcome.ok) {
        const message =
          outcome.reason === "already-confirmed"
            ? `Batch ${batchId} was already confirmed; nothing was removed.`
            : `Unknown batch id ${batchId}; nothing was removed.`;

        return { ok: false, message };
      }

      return { ok: true, result: await store.removeByHashes(new Set(outcome.hashes)) };
    },

    async status() {
      const { notes } = await store.read();

      return {
        file: filePath,
        backupExists: await store.backupExists(),
        remaining: notes.length,
        pendingBatches: session.pendingCount(),
      };
    },
  };
}
