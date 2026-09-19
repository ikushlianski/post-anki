import pRetry from "p-retry";
import { loadEnv, type Env } from "./env.js";
import { log } from "./log.js";

// Calls OpenRouter's /embeddings endpoint directly — applies the
// OPENROUTER_BASE_URL override manually since there's no Mastra Agent here.
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

// Maps by the response's own `index` field, never by array position — a
// wrong assumption here would silently mismap a vector to the wrong item.
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

export interface EmbedTextsItem {
  id: string;
  text: string;
}

export interface EmbeddedTextResult {
  id: string;
  embedding: number[];
}

// Bounded on both axes: at most 2 retries and a 45s per-request timeout.
// A failure after the retry budget throws — never a silent empty result.
export async function embedTexts(items: EmbedTextsItem[]): Promise<EmbeddedTextResult[]> {
  if (items.length === 0) {
    return [];
  }

  const input = items.map((item) => item.text);

  const embeddings = await pRetry(() => callEmbeddingsEndpoint(input), {
    retries: RETRIES,
    onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
      log.warn(
        { attempt: attemptNumber, retriesLeft, err: error, count: items.length },
        "embeddings_client_retry",
      );
    },
  });

  return items.map((item, i) => ({ id: item.id, embedding: embeddings[i]! }));
}
