import { randomUUID } from "node:crypto";

export type ConfirmResult =
  | { ok: true; hashes: string[] }
  | { ok: false; reason: "unknown" | "already-confirmed" };

export type BatchSession = {
  open(hashes: string[]): string;
  confirm(batchId: string): ConfirmResult;
  openHashes(): Set<string>;
  pendingCount(): number;
};

type Batch = { hashes: string[]; confirmed: boolean };

export function createBatchSession(): BatchSession {
  const batches = new Map<string, Batch>();

  return {
    open(hashes) {
      const batchId = randomUUID();

      batches.set(batchId, { hashes: [...hashes], confirmed: false });

      return batchId;
    },
    confirm(batchId) {
      const batch = batches.get(batchId);

      if (!batch) return { ok: false, reason: "unknown" };

      if (batch.confirmed) return { ok: false, reason: "already-confirmed" };

      batch.confirmed = true;

      return { ok: true, hashes: batch.hashes };
    },
    openHashes() {
      const hashes = new Set<string>();

      for (const batch of batches.values()) {
        if (batch.confirmed) continue;

        for (const hash of batch.hashes) hashes.add(hash);
      }

      return hashes;
    },
    pendingCount() {
      return [...batches.values()].filter((batch) => !batch.confirmed).length;
    },
  };
}
