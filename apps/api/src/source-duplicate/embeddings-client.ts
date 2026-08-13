import pRetry from "p-retry";
import { loadEnv, type Env } from "../shared/env.js";
import { log } from "../shared/log.js";

// Thin, source-scoped copy of subject-duplicate/embeddings-client.ts's
// request shape — calls OpenRouter's /embeddings endpoint directly via
// fetch() rather than through a Mastra Agent (no chat/generation step
// here, just a vector), so it must apply the OPENROUTER_BASE_URL override
// manually or e2e's mock server never gets hit.
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const TIMEOUT_MS = 45_000;
const RETRIES = 2;

function endpointUrl(env: Env): string {
  const base = env.OPENROUTER_BASE_URL ?? DEFAULT_BASE_URL;

  return `${base.replace(/\/$/, "")}/embeddings`;
}

interface EmbeddingObject {
  index: number;
  embedding: number[];
}

interface EmbeddingsResponse {
  data?: EmbeddingObject[];
  error?: { message?: string };
}

// Mapping by the response's own `index` field (rather than trusting array
// position blindly) turns "a batched input returns results in strict
// positional order" into an enforced runtime invariant instead of a silent
// one — if OpenRouter's behavior ever changes, this throws instead of
// silently mismapping a vector to the wrong source. Same verified
// assumption subject-duplicate's client already relies on for this same
// endpoint/model.
async function callEmbeddingsEndpoint(input: string[]): Promise<number[][]> {
  const env = loadEnv();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(endpointUrl(env), {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: env.EMBEDDING_MODEL, input }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");

      throw new Error(`embeddings endpoint returned ${res.status}: ${body}`);
    }

    const data = (await res.json()) as EmbeddingsResponse;

    if (!data.data || data.data.length !== input.length) {
      throw new Error(
        `embeddings endpoint returned ${data.data?.length ?? 0} results for ${input.length} inputs`,
      );
    }

    const byIndex = new Map(data.data.map((item) => [item.index, item.embedding]));
    const embeddings: number[][] = [];

    for (let i = 0; i < input.length; i++) {
      const embedding = byIndex.get(i);

      if (!embedding) {
        throw new Error(`embeddings endpoint response missing result for index ${i}`);
      }

      embeddings.push(embedding);
    }

    return embeddings;
  } finally {
    clearTimeout(timer);
  }
}

export interface EmbedSourceTextsItem {
  id: string;
  text: string;
}

export interface EmbeddedSourceResult {
  id: string;
  embedding: number[];
}

// Bounded on both axes — at most 2 retries (p-retry, 3 attempts total) AND
// a 45s per-request timeout — never an unbounded loop, never an
// indefinitely busy scan button. A failure after the retry budget is
// exhausted propagates as a thrown error; the orchestrator does not catch
// it, same no-silent-fallback posture as subject-duplicate's own client.
export async function embedSourceTexts(
  items: EmbedSourceTextsItem[],
): Promise<EmbeddedSourceResult[]> {
  if (items.length === 0) {
    return [];
  }

  const input = items.map((item) => item.text);

  const embeddings = await pRetry(() => callEmbeddingsEndpoint(input), {
    retries: RETRIES,
    onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
      log.warn(
        { attempt: attemptNumber, retriesLeft, err: error, count: items.length },
        "source_duplicate_embeddings_retry",
      );
    },
  });

  return items.map((item, i) => ({ id: item.id, embedding: embeddings[i]! }));
}
