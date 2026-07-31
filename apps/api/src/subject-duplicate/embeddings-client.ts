import pRetry from "p-retry";
import { loadEnv, type Env } from "../shared/env.js";
import { log } from "../shared/log.js";

// This module calls OpenRouter's /embeddings endpoint directly via fetch()
// rather than through a Mastra Agent (there's no chat/generation step here,
// just a vector) — so, like tech-research-grounding.ts, it must apply the
// OPENROUTER_BASE_URL override manually, or e2e's mock server never gets
// hit and every call here silently 401s instead of routing to the mock.
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

// Confirmed against the real OpenRouter endpoint (todo.md's critical first
// step, run once during this feature's implementation): the key has
// embeddings access, a batched `input: string[]` returns results in strict
// positional order (each result also carries its own `index`, matching
// array position, at both a 3-item and a 200-item batch), and a worst-case
// 200-item/2000-char-description batch (~66.6k tokens) succeeds with no
// batch-size error. Mapping by the response's own `index` field below
// (rather than trusting array position blindly) turns that verified
// assumption into an enforced runtime invariant instead of a silent one —
// if OpenRouter's behavior ever changes, this throws instead of silently
// mismapping a vector to the wrong subject.
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

export interface EmbedSubjectTextsItem {
  id: string;
  text: string;
}

export interface EmbeddedSubjectResult {
  id: string;
  embedding: number[];
}

// SCENARIO 6: bounded on both axes — at most 2 retries (p-retry, 3 attempts
// total) AND a 45s per-request timeout — never an unbounded loop, never an
// indefinitely busy scan button. A failure after the retry budget is
// exhausted propagates as a thrown error; the orchestrator does not catch
// it (spec.md's Decisions #4 / architecture.md's Failure modes — no
// silent-fallback posture here, mirrors triggerDomainPriorityReview).
export async function embedSubjectTexts(
  items: EmbedSubjectTextsItem[],
): Promise<EmbeddedSubjectResult[]> {
  if (items.length === 0) {
    return [];
  }

  const input = items.map((item) => item.text);

  const embeddings = await pRetry(() => callEmbeddingsEndpoint(input), {
    retries: RETRIES,
    onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
      log.warn(
        { attempt: attemptNumber, retriesLeft, err: error, count: items.length },
        "subject_duplicate_embeddings_retry",
      );
    },
  });

  return items.map((item, i) => ({ id: item.id, embedding: embeddings[i]! }));
}
