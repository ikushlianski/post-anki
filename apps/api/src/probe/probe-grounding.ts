import { loadEnv } from "../shared/env.js";
import { log } from "../shared/log.js";
import { getCurriculumGroundingText } from "../curriculum/curriculum.repo.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 45_000;
const MAX_RESULTS = 4;
const MAX_CHARS = 8_000;
const MIN_SOURCE_CHARS = 200;

export interface ProbeGrounding {
  text: string;
  fromWeb: boolean;
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
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

    return { text: truncate(pasted), fromWeb: false };
  }

  const web = await webGround(topicTitle, focus);

  log.info(
    { curriculumId, source: web.length > 0 ? "web" : "none", chars: web.length },
    "probe_grounding",
  );

  return { text: web, fromWeb: web.length > 0 };
}

async function webGround(topicTitle: string, focus: string): Promise<string> {
  const env = loadEnv();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: restModel(),
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
      return "";
    }

    const data = (await res.json()) as ChatResponse;
    const body = data.choices?.[0]?.message?.content?.trim() ?? "";

    if (body.length === 0) {
      log.warn({ focus, error: data.error?.message }, "probe_web_ground_empty");
    }

    return truncate(body);
  } catch (err) {
    log.warn({ err, focus }, "probe_web_ground_failed");
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function truncate(text: string): string {
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}
