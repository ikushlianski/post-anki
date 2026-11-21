import { MINING_MAX_BITS_PER_DAY } from "./card-synthesis-mining.config.js";
import {
  miningSelectionStore,
  type MiningCandidateBit,
  type MiningSelectionStore,
  type SubjectNode,
} from "./card-synthesis-mining-selection.repo.js";

export const MINING_MIN_BITS_PER_SUBJECT = 5;

export interface MiningBatch {
  subjectId: string;
  bits: MiningCandidateBit[];
}

export interface SelectMiningBatchInput {
  allowedSubjectIds: string[];
  maxBits?: number;
  minBits?: number;
}

export function subjectSubtreeIds(rootId: string, nodes: SubjectNode[]): string[] {
  const childrenByParent = new Map<string, string[]>();

  for (const node of nodes) {
    if (node.parentId !== null) {
      childrenByParent.set(node.parentId, [...(childrenByParent.get(node.parentId) ?? []), node.id]);
    }
  }

  const seen = new Set<string>([rootId]);
  const queue = [rootId];

  for (let head = 0; head < queue.length; head += 1) {
    for (const child of childrenByParent.get(queue[head] as string) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }

  return queue;
}

export async function selectMiningBatch(
  input: SelectMiningBatchInput,
  store: MiningSelectionStore = miningSelectionStore,
): Promise<MiningBatch | null> {
  if (input.allowedSubjectIds.length === 0) {
    return null;
  }

  const maxBits = input.maxBits ?? MINING_MAX_BITS_PER_DAY;
  const minBits = input.minBits ?? MINING_MIN_BITS_PER_SUBJECT;
  const nodes = await store.listSubjects();
  const known = new Set(nodes.map((node) => node.id));

  for (const subjectId of input.allowedSubjectIds) {
    if (!known.has(subjectId)) {
      continue;
    }

    const bits = await store.listUnexaminedEmbeddedBits(subjectSubtreeIds(subjectId, nodes), maxBits);

    if (bits.length >= minBits) {
      return { subjectId, bits: bits.slice(0, maxBits) };
    }
  }

  return null;
}
