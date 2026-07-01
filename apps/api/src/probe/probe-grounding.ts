import { loadEnv } from "../shared/env.js";
import { log } from "../shared/log.js";
import { startTracingSpan } from "../mastra/mastra.js";
import { getCurriculumGroundingText } from "../curriculum/curriculum.repo.js";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const TIMEOUT_MS = 45_000;
const MAX_RESULTS = 4;
const MAX_CHARS = 8_000;
const MIN_SOURCE_CHARS = 200;

export interface ProbeGrounding {
  text: string;
  fromWeb: boolean;
  citations: string[];
}

interface UrlCitation {
  url?: string;
}

interface Annotation {
  url_citation?: UrlCitation;
}

interface ChatResponse {
  choices?: { message?: { content?: string; annotations?: Annotation[] } }[];
  error?: { message?: string };
}

function restModel(): string {
  return loadEnv().CURRICULUM_MODEL.replace(/^openrouter\//, "");
}

export async function gatherProbeGrounding(
  curriculumId: string,
  topicTitle: string,
  focus: string,
): Promise<ProbeGrounding> {
  const pasted = (await getCurriculumGroundingText(curriculumId)).trim();

  if (pasted.length >= MIN_SOURCE_CHARS) {
    log.info({ curriculumId, source: "pasted", chars: pasted.length }, "probe_grounding");

    return { text: truncate(pasted), fromWeb: false, citations: [] };
  }

  const web = await webGround(topicTitle, focus);

  log.info(
    {
      curriculumId,
      source: web.text.length > 0 ? "web" : "none",
      chars: web.text.length,
      citations: web.citations.length,
    },
    "probe_grounding",
  );

  return { text: web.text, fromWeb: web.text.length > 0, citations: web.citations };
}

async function webGround(
  topicTitle: string,
  focus: string,
): Promise<{ text: string; citations: string[] }> {
  const env = loadEnv();
  const model = restModel();
  const endpoint = `${env.OPENROUTER_BASE_URL ?? DEFAULT_BASE_URL}/chat/completions`;
  const span = startTracingSpan("probe.web_grounding", { topicTitle, focus, model });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        tools: [{ type: "openrouter:web_search", max_results: MAX_RESULTS }],
        messages: [
          {
            role: "user",
            content: [
              `Search the web for current, authoritative information to ground a senior-level`,
              `architecture question about: ${focus} (topic: ${topicTitle}).`,
              `Return concise grounding notes — key facts, tradeoffs, and current best practices.`,
              `Favour judgment over syntax. Do not write the question itself.`,
            ].join(" "),
          },
        ],
      }),
    });

    if (!res.ok) {
      log.warn({ status: res.status, focus }, "probe_web_ground_http_error");
      span?.end({ output: { outcome: "http_error", status: res.status } });

      return { text: "", citations: [] };
    }

    const data = (await res.json()) as ChatResponse;
    const message = data.choices?.[0]?.message;
    const body = message?.content?.trim() ?? "";

    if (body.length === 0) {
      log.warn({ focus, error: data.error?.message }, "probe_web_ground_empty");
    }

    const text = truncate(body);
    const citations = collectCitations(message?.annotations);

    span?.end({
      output: { outcome: body.length === 0 ? "empty" : "ok", chars: text.length, citations: citations.length },
    });

    return { text, citations };
  } catch (err) {
    log.warn({ err, focus }, "probe_web_ground_failed");
    span?.error({ error: err instanceof Error ? err : new Error(String(err)) });

    return { text: "", citations: [] };
  } finally {
    clearTimeout(timer);
  }
}

function collectCitations(annotations?: Annotation[]): string[] {
  if (!annotations) {
    return [];
  }

  return annotations
    .map((a) => a.url_citation?.url)
    .filter((u): u is string => Boolean(u));
}

function truncate(text: string): string {
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}
