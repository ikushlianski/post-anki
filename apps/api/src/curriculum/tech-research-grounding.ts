import { loadEnv } from "../shared/env.js";
import { log } from "../shared/log.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 45_000;
const MAX_RESULTS = 4;
const MAX_CHARS = 8_000;

export interface TechResearchGrounding {
  text: string;
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

async function gatherGrounding(
  instructionParts: string[],
  logContext: Record<string, unknown>,
): Promise<TechResearchGrounding> {
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
            content: instructionParts.join(" "),
          },
        ],
      }),
    });

    if (!res.ok) {
      log.warn({ ...logContext, status: res.status }, "tech_research_ground_http_error");
      return { text: "", citations: [] };
    }

    const data = (await res.json()) as ChatResponse;
    const message = data.choices?.[0]?.message;
    const body = message?.content?.trim() ?? "";

    if (body.length === 0) {
      log.warn({ ...logContext, error: data.error?.message }, "tech_research_ground_empty");
    }

    return { text: truncate(body), citations: collectCitations(message?.annotations) };
  } catch (err) {
    log.warn({ ...logContext, err }, "tech_research_ground_failed");
    return { text: "", citations: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function gatherTechResearchGrounding(
  technologyName: string,
  siteHost?: string,
): Promise<TechResearchGrounding> {
  const searchInstruction = siteHost
    ? `Search site:${siteHost} for current, authoritative information about the technology: ${technologyName}. Restrict results to that site.`
    : `Search the web for current, authoritative information about the technology: ${technologyName}.`;

  return gatherGrounding(
    [
      searchInstruction,
      `Return concise grounding notes covering: current version and recent API/behavior changes,`,
      `canonical terminology, core concepts a learner would need at a basic/medium/advanced tier,`,
      `and common pitfalls. Favour judgment over syntax.`,
    ],
    { technologyName },
  );
}

export async function gatherLectureSourceGrounding(
  topicTitle: string,
  curriculumContext?: string,
): Promise<TechResearchGrounding> {
  const contextSuffix = curriculumContext
    ? ` in the context of ${curriculumContext}`
    : "";

  return gatherGrounding(
    [
      `Search the web for real, citable sources about: ${topicTitle}${contextSuffix}.`,
      `Favor material from well-known AI research labs/companies (e.g. OpenAI, Anthropic, Google DeepMind, Meta AI)`,
      `or well-known named practitioners, over generic blog posts or tutorial sites with no clear authorship.`,
      `Return concise grounding notes summarizing what each surfaced source actually covers, so a later step`,
      `can select the most relevant ones as lecture sources.`,
    ],
    { topicTitle },
  );
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
