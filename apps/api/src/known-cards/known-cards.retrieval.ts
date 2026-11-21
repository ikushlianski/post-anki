import {
  listActiveVariantsForBitsEmbedding,
  searchApprovedBitsByEmbedding,
} from "../knowledge-bit/knowledge-bit-embedding.repo.js";
import { embedTexts } from "../shared/embeddings-client.js";
import {
  KNOWN_CARDS_CHUNK_EMBED_CHARS,
  KNOWN_CARDS_OP_EMBED,
  KNOWN_CARDS_SIMILARITY_FLOOR,
  KNOWN_CARDS_TOP_K,
} from "./known-cards.config.js";
import { KnownCardsLedgeredError, type KnownCardCandidate } from "./known-cards.types.js";

async function embedChunk(chunkText: string, knowledgeSourceId: string | null): Promise<number[] | null> {
  try {
    const [first] = await embedTexts(
      [{ id: "chunk", text: chunkText.slice(0, KNOWN_CARDS_CHUNK_EMBED_CHARS) }],
      { op: KNOWN_CARDS_OP_EMBED, knowledgeSourceId },
    );

    return first?.embedding ?? null;
  } catch (err) {
    throw new KnownCardsLedgeredError("embed", err);
  }
}

export async function retrieveKnownCardCandidates(
  chunkText: string,
  knowledgeSourceId: string | null,
): Promise<KnownCardCandidate[]> {
  if (chunkText.trim().length === 0) {
    return [];
  }

  const embedding = await embedChunk(chunkText, knowledgeSourceId);

  if (!embedding) {
    return [];
  }

  const bits = await searchApprovedBitsByEmbedding(
    embedding,
    KNOWN_CARDS_TOP_K,
    KNOWN_CARDS_SIMILARITY_FLOOR,
  );

  if (bits.length === 0) {
    return [];
  }

  const variants = await listActiveVariantsForBitsEmbedding(bits.map((bit) => bit.id));
  const byBit = new Map(variants.map((variant) => [variant.knowledgeBitId, variant]));

  return bits.map((bit) => {
    const variant = byBit.get(bit.id);

    return {
      id: bit.id,
      body: bit.body,
      question: variant?.prompt ?? null,
      answer: variant?.answer ?? null,
      similarity: bit.similarity,
    };
  });
}
