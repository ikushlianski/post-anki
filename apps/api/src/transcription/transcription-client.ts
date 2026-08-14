import pRetry from "p-retry";
import { loadEnv, type Env } from "../shared/env.js";
import { log } from "../shared/log.js";

// This module calls OpenRouter's /chat/completions endpoint directly via
// fetch() rather than through a Mastra Agent — this is a single non-
// conversational call with no multi-turn state, the same shape as
// embeddings-client.ts's own /embeddings call — so, like that module and
// tech-research-grounding.ts, it must apply the OPENROUTER_BASE_URL override
// manually, or e2e's mock server never gets hit.
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const TIMEOUT_MS = 45_000;
const RETRIES = 2;
const DEFAULT_AUDIO_FORMAT = "ogg";

function endpointUrl(env: Env): string {
  const base = env.OPENROUTER_BASE_URL ?? DEFAULT_BASE_URL;

  return `${base.replace(/\/$/, "")}/chat/completions`;
}

// tech-research-grounding.ts and probe-grounding.ts both strip this same
// prefix before a direct fetch() call to OpenRouter's REST API — the
// "openrouter/..." form is a Vercel-AI-SDK/Mastra provider-routing
// convention Mastra's own Agent resolves internally, but OpenRouter's REST
// API itself expects the bare "google/gemini-2.5-flash" form. Skipping this
// here (as embeddings-client.ts does, safely, only because EMBEDDING_MODEL's
// own default never carries the prefix) would send an invalid model id to
// the real endpoint.
function restModel(env: Env): string {
  return env.TRANSCRIPTION_MODEL.replace(/^openrouter\//, "");
}

function audioFormat(mimeType: string): string {
  const subtype = mimeType.split("/")[1]?.split(";")[0]?.trim();

  return subtype && subtype.length > 0 ? subtype : DEFAULT_AUDIO_FORMAT;
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export interface TranscribeAudioParams {
  audioBase64: string;
  mimeType: string;
}

async function callTranscriptionEndpoint(params: TranscribeAudioParams): Promise<string> {
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
      body: JSON.stringify({
        model: restModel(env),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Transcribe this audio. Reply with only the transcript, nothing else.",
              },
              {
                type: "input_audio",
                input_audio: { data: params.audioBase64, format: audioFormat(params.mimeType) },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");

      throw new Error(`transcription endpoint returned ${res.status}: ${body}`);
    }

    const data = (await res.json()) as ChatResponse;

    return data.choices?.[0]?.message?.content?.trim() ?? "";
  } finally {
    clearTimeout(timer);
  }
}

// Deliberately no silent-fallback posture (mirrors embedSubjectTexts /
// triggerDomainPriorityReview) — a failure after the retry budget is
// exhausted propagates as a thrown error; transcription.controller.ts maps
// it to a 502, and apps/bot's voice-transcription.ts turns that rejected
// call into a null (never a thrown/unhandled rejection reaching the message
// handler).
export async function transcribeAudio(params: TranscribeAudioParams): Promise<string> {
  return pRetry(() => callTranscriptionEndpoint(params), {
    retries: RETRIES,
    onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
      log.warn(
        { attempt: attemptNumber, retriesLeft, err: error },
        "transcription_retry",
      );
    },
  });
}
