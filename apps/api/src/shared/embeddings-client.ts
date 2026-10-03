import pRetry, { AbortError } from "p-retry";
import { loadEnv, type Env } from "./env.js";
import { log } from "./log.js";
import { recordLlmCallEvent } from "../llm-call-events/llm-call-events.repo.js";

const EMBEDDINGS_AGENT_KEY = "openrouterEmbeddings";

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

interface EmbeddingsUsage {
  prompt_tokens?: number;
  total_tokens?: number;
}

interface EmbeddingsResponse {
  data?: EmbeddingObject[];
  error?: { message?: string };
  usage?: EmbeddingsUsage;
}

interface EmbeddingsResult {
  embeddings: number[][];
  usage?: EmbeddingsUsage;
}

// Maps by the response's own `index` field, never by array position — a
// wrong assumption here would silently mismap a vector to the wrong item.
async function callEmbeddingsEndpoint(input: string[]): Promise<EmbeddingsResult> {
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
      const message = `embeddings endpoint returned ${res.status}: ${body}`;

      // 4xx other than 429 is a non-transient request problem — retrying it
      // just spends paid attempts on something that fails identically every time.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new AbortError(message);
      }

      throw new Error(message);
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

    return { embeddings, usage: data.usage };
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

// Second layer of defense on top of recordLlmCallEvent's own DB-write guard,
// so a bug there can never surface as a failure of the real embeddings call.
async function safeRecordEmbeddingsCallEvent(
  input: Parameters<typeof recordLlmCallEvent>[0],
): Promise<void> {
  try {
    await recordLlmCallEvent(input);
  } catch (err) {
    log.warn({ err, op: input.op }, "llm_call_event_record_failed");
  }
}

// Bounded on both axes: at most 2 retries and a 45s per-request timeout.
// A failure after the retry budget throws — never a silent empty result.
export async function embedTexts(items: EmbedTextsItem[]): Promise<EmbeddedTextResult[]> {
  if (items.length === 0) {
    return [];
  }

  const input = items.map((item) => item.text);
  const startedAt = Date.now();

  let result: EmbeddingsResult;

  try {
    result = await pRetry(() => callEmbeddingsEndpoint(input), {
      retries: RETRIES,
      onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
        log.warn(
          { attempt: attemptNumber, retriesLeft, err: error, count: items.length },
          "embeddings_client_retry",
        );
      },
    });
  } catch (err) {
    await safeRecordEmbeddingsCallEvent({
      curriculumId: null,
      op: "embedTexts",
      agentKey: EMBEDDINGS_AGENT_KEY,
      durationMs: Date.now() - startedAt,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    });

    throw err;
  }

  await safeRecordEmbeddingsCallEvent({
    curriculumId: null,
    op: "embedTexts",
    agentKey: EMBEDDINGS_AGENT_KEY,
    durationMs: Date.now() - startedAt,
    success: true,
    errorMessage: null,
    promptTokens: result.usage?.prompt_tokens ?? null,
    completionTokens: null,
    totalTokens: result.usage?.total_tokens ?? null,
  });

  return items.map((item, i) => ({ id: item.id, embedding: result.embeddings[i]! }));
}
