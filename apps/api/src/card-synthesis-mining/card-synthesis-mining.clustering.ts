import { MINING_CLUSTER_SIMILARITY } from "./card-synthesis-mining.config.js";

export const MINING_MIN_CLUSTER_SIZE = 3;
export const MINING_MAX_CLUSTER_SIZE = 12;

export interface EmbeddedBit {
  id: string;
  embedding: number[];
}

export interface MiningCluster {
  bitIds: string[];
  overflowBitIds: string[];
}

export interface ClusteringResult {
  clusters: MiningCluster[];
  unclusteredBitIds: string[];
}

export interface ClusteringOptions {
  threshold?: number;
  minSize?: number;
  maxSize?: number;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;

    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function findRoot(parents: number[], index: number): number {
  let root = index;

  while (parents[root] !== root) {
    root = parents[root] ?? root;
  }

  return root;
}

function union(parents: number[], a: number, b: number): void {
  const rootA = findRoot(parents, a);
  const rootB = findRoot(parents, b);

  if (rootA === rootB) {
    return;
  }

  parents[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
}

function splitByCloseness(
  members: number[],
  similarities: number[][],
  maxSize: number,
): { kept: number[]; overflow: number[] } {
  if (members.length <= maxSize) {
    return { kept: members, overflow: [] };
  }

  const scored = members.map((index) => {
    const total = members.reduce(
      (sum, other) => (other === index ? sum : sum + (similarities[index]?.[other] ?? 0)),
      0,
    );

    return { index, score: total / (members.length - 1) };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  const kept = scored.slice(0, maxSize).map((entry) => entry.index).sort((a, b) => a - b);
  const keptSet = new Set(kept);

  return { kept, overflow: members.filter((index) => !keptSet.has(index)) };
}

export function clusterBits(bits: EmbeddedBit[], options: ClusteringOptions = {}): ClusteringResult {
  const threshold = options.threshold ?? MINING_CLUSTER_SIMILARITY;
  const minSize = options.minSize ?? MINING_MIN_CLUSTER_SIZE;
  const maxSize = options.maxSize ?? MINING_MAX_CLUSTER_SIZE;
  const parents = bits.map((_, index) => index);
  const similarities = bits.map(() => new Array<number>(bits.length).fill(0));

  for (let i = 0; i < bits.length; i += 1) {
    for (let j = i + 1; j < bits.length; j += 1) {
      const similarity = cosineSimilarity(bits[i]?.embedding ?? [], bits[j]?.embedding ?? []);

      (similarities[i] as number[])[j] = similarity;
      (similarities[j] as number[])[i] = similarity;

      if (similarity >= threshold) {
        union(parents, i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();

  bits.forEach((_, index) => {
    const root = findRoot(parents, index);

    groups.set(root, [...(groups.get(root) ?? []), index]);
  });

  const clusters: MiningCluster[] = [];
  const clustered = new Set<number>();

  for (const members of [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value)) {
    if (members.length < minSize) {
      continue;
    }

    const { kept, overflow } = splitByCloseness(members, similarities, maxSize);

    members.forEach((index) => clustered.add(index));
    clusters.push({
      bitIds: kept.map((index) => bits[index]?.id ?? ""),
      overflowBitIds: overflow.map((index) => bits[index]?.id ?? ""),
    });
  }

  return {
    clusters,
    unclusteredBitIds: bits.filter((_, index) => !clustered.has(index)).map((bit) => bit.id),
  };
}
