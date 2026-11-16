export interface NearDuplicateCard {
  variantId: string;
  bitId: string;
  prompt: string;
  answer: string;
}

export interface NearDuplicatePair {
  similarity: number;
  a: NearDuplicateCard;
  b: NearDuplicateCard;
}

export interface EmbeddedCard {
  card: NearDuplicateCard;
  embedding: number[];
}

const FRONT_CHARS = 200;
const BACK_CHARS = 300;

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function pairKey(a: NearDuplicateCard, b: NearDuplicateCard): string {
  return a.variantId < b.variantId ? `${a.variantId}|${b.variantId}` : `${b.variantId}|${a.variantId}`;
}

export function buildPairsAmong(cards: EmbeddedCard[], threshold: number): NearDuplicatePair[] {
  const pairs: NearDuplicatePair[] = [];

  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const left = cards[i]!;
      const right = cards[j]!;

      if (left.card.bitId === right.card.bitId) {
        continue;
      }

      const similarity = cosineSimilarity(left.embedding, right.embedding);

      if (similarity >= threshold) {
        pairs.push({ similarity, a: left.card, b: right.card });
      }
    }
  }

  return pairs;
}

export function mergePairs(...groups: NearDuplicatePair[][]): NearDuplicatePair[] {
  const byKey = new Map<string, NearDuplicatePair>();

  for (const pair of groups.flat()) {
    const key = pairKey(pair.a, pair.b);
    const existing = byKey.get(key);

    if (!existing || pair.similarity > existing.similarity) {
      byKey.set(key, pair);
    }
  }

  return [...byKey.values()].sort(
    (x, y) => y.similarity - x.similarity || pairKey(x.a, x.b).localeCompare(pairKey(y.a, y.b)),
  );
}

export function truncateText(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();

  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

function formatCard(label: string, card: NearDuplicateCard): string[] {
  return [
    `- ${label} (bit \`${card.bitId}\`, variant \`${card.variantId}\`)`,
    `  - Front: ${truncateText(card.prompt, FRONT_CHARS)}`,
    `  - Back: ${truncateText(card.answer, BACK_CHARS)}`,
  ];
}

export function formatNearDuplicateReport(input: {
  subject: string;
  threshold: number;
  scannedCards: number;
  embeddedInMemory: number;
  pairs: NearDuplicatePair[];
}): string {
  const lines = [
    `# Near-duplicate cards: ${input.subject}`,
    "",
    `- Approved basic cards scanned: ${input.scannedCards}`,
    `- Embedded in memory (not stored): ${input.embeddedInMemory}`,
    `- Similarity threshold: ${input.threshold}`,
    `- Pairs found: ${input.pairs.length}`,
    "",
  ];

  if (input.pairs.length === 0) {
    lines.push("No near-duplicate pairs found.", "");

    return lines.join("\n");
  }

  input.pairs.forEach((pair, index) => {
    lines.push(`## ${index + 1}. Similarity ${pair.similarity.toFixed(3)}`, "");
    lines.push(...formatCard("A", pair.a), ...formatCard("B", pair.b), "");
  });

  return lines.join("\n");
}
