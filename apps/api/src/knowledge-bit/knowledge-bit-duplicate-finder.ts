import {
  DUPLICATE_FRONT_SIMILARITY,
  DUPLICATE_PAIR_SIMILARITY,
  type DuplicateCheck,
  type DuplicateMatch,
} from "@post-anki/shared";
import { embedTexts } from "../shared/embeddings-client.js";
import { log } from "../shared/log.js";
import { cardTextKey, normalizeCardText } from "./knowledge-bit-card-text-key.js";
import {
  findLiteralCandidates,
  findSemanticCandidates,
  type DuplicateCandidate,
} from "./knowledge-bit-duplicate-finder.repo.js";

const SLICE_WORDS = 6;
const MIN_SLICE_CHARS = 3;
const CANDIDATE_LIMIT = 20;
const MAX_MATCHES = 10;

export interface DuplicateDraft {
  front: string;
  back: string;
}

export function distinctiveSlice(front: string): string {
  const words = front.trim().split(/\s+/).filter(Boolean);

  if (words.length <= SLICE_WORDS) {
    return words.join(" ");
  }

  let best = 0;
  let bestLength = -1;

  for (let start = 0; start + SLICE_WORDS <= words.length; start += 1) {
    const length = words.slice(start, start + SLICE_WORDS).join("").length;

    if (length > bestLength) {
      best = start;
      bestLength = length;
    }
  }

  return words.slice(best, best + SLICE_WORDS).join(" ");
}

function literalFrontMatch(candidate: DuplicateCandidate, front: string, slice: string): boolean {
  const wanted = normalizeCardText(front);
  const prompt = normalizeCardText(candidate.prompt);
  const body = normalizeCardText(candidate.bitBody);
  const part = normalizeCardText(slice);

  return prompt === wanted || body === wanted || (part.length >= MIN_SLICE_CHARS && (prompt.includes(part) || body.includes(part)));
}

function toMatch(
  candidate: DuplicateCandidate,
  kind: DuplicateMatch["kind"],
  matchKind: DuplicateMatch["matchKind"],
  similarity: number | null,
): DuplicateMatch {
  return {
    id: candidate.bitId,
    front: candidate.prompt,
    back: candidate.answer,
    subject: candidate.subjectId ? { id: candidate.subjectId, name: candidate.subjectName ?? candidate.subjectId } : null,
    similarity,
    matchKind,
    kind,
  };
}

async function semanticCandidates(draft: DuplicateDraft) {
  const pairText = draft.back ? `${draft.front}\n${draft.back}` : draft.front;
  const embedded = await embedTexts([
    { id: "front", text: draft.front },
    { id: "pair", text: pairText },
  ]);
  const vector = (id: string) => embedded.find((item) => item.id === id)?.embedding;
  const front = vector("front");
  const pair = vector("pair");

  if (!front || !pair) {
    throw new Error("embedding missing");
  }

  const [byFront, byPair] = await Promise.all([
    findSemanticCandidates(front, DUPLICATE_FRONT_SIMILARITY, CANDIDATE_LIMIT),
    findSemanticCandidates(pair, DUPLICATE_PAIR_SIMILARITY, CANDIDATE_LIMIT),
  ]);

  return { byFront, byPair };
}

function strongest(matches: DuplicateMatch[]): DuplicateMatch[] {
  const byId = new Map<string, DuplicateMatch>();
  const rank = (m: DuplicateMatch) => (m.kind === "duplicate" ? 2 : 0) + (m.matchKind === "literal" ? 1 : 0);

  for (const match of matches) {
    const current = byId.get(match.id);

    if (!current || rank(match) > rank(current) || (rank(match) === rank(current) && (match.similarity ?? 0) > (current.similarity ?? 0))) {
      byId.set(match.id, match);
    }
  }

  return [...byId.values()]
    .sort((a, b) => rank(b) - rank(a) || (b.similarity ?? 0) - (a.similarity ?? 0))
    .sort((a, b) => Number(b.kind === "duplicate") - Number(a.kind === "duplicate"))
    .slice(0, MAX_MATCHES);
}

// Literal matches always run; the embedding pass is skipped (semanticChecked=false) when it fails.
export async function findDuplicateCards(draft: DuplicateDraft): Promise<DuplicateCheck> {
  const slice = distinctiveSlice(draft.front);
  const literal = slice.length >= MIN_SLICE_CHARS
    ? await findLiteralCandidates(slice, cardTextKey(draft.front, draft.back), CANDIDATE_LIMIT)
    : [];
  const backKey = normalizeCardText(draft.back);
  const matches: DuplicateMatch[] = [];

  for (const candidate of literal) {
    if (!literalFrontMatch(candidate, draft.front, slice)) {
      continue;
    }

    const backSame = backKey === "" || normalizeCardText(candidate.answer) === backKey;

    matches.push(toMatch(candidate, backSame ? "duplicate" : "possible_duplicate", "literal", 1));
  }

  let semanticChecked = true;

  try {
    const { byFront, byPair } = await semanticCandidates(draft);

    for (const candidate of byPair) {
      matches.push(toMatch(candidate, "duplicate", "semantic", candidate.similarity));
    }

    for (const candidate of byFront) {
      matches.push(toMatch(candidate, "possible_duplicate", "semantic", candidate.similarity));
    }
  } catch (err) {
    semanticChecked = false;
    log.warn({ err }, "duplicate_finder_embedding_unavailable");
  }

  return { matches: strongest(matches), semanticChecked };
}
