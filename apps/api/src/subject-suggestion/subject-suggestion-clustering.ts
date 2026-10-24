import { cosineSimilarity } from "@post-anki/core";

export interface ClusterItem {
  id: string;
  embedding: number[];
}

export interface Cluster<T extends ClusterItem> {
  members: T[];
  centroid: number[];
}

export function leaderCluster<T extends ClusterItem>(items: T[], joinSimilarity: number): Cluster<T>[] {
  const clusters: Cluster<T>[] = [];
  const sums: number[][] = [];

  for (const item of items) {
    let best = -1;
    let bestSimilarity = -Infinity;

    clusters.forEach((cluster, index) => {
      if (cluster.centroid.length !== item.embedding.length) {
        return;
      }

      const similarity = cosineSimilarity(cluster.centroid, item.embedding);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        best = index;
      }
    });

    if (best >= 0 && bestSimilarity >= joinSimilarity) {
      const cluster = clusters[best]!;
      const sum = sums[best]!;

      cluster.members.push(item);
      item.embedding.forEach((value, i) => {
        sum[i] = sum[i]! + value;
      });
      cluster.centroid = sum.map((value) => value / cluster.members.length);
    } else {
      clusters.push({ members: [item], centroid: [...item.embedding] });
      sums.push([...item.embedding]);
    }
  }

  return clusters;
}

export function closestToCentroid<T extends ClusterItem>(cluster: Cluster<T>, count: number): T[] {
  return [...cluster.members]
    .map((member) => ({ member, similarity: cosineSimilarity(cluster.centroid, member.embedding) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, count)
    .map((entry) => entry.member);
}
