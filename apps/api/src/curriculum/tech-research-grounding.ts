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

export async function gatherTechResearchGrounding(
  technologyName: string,
  siteHost?: string,
): Promise<TechResearchGrounding> {
  const env = loadEnv();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const searchInstruction = siteHost
      ? `Search site:${siteHost} for current, authoritative information about the technology: ${technologyName}. Restrict results to that site.`
      : `Search the web for current, authoritative information about the technology: ${technologyName}.`;

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
              searchInstruction,
              `Return concise grounding notes covering: current version and recent API/behavior changes,`,
              `canonical terminology, core concepts a learner would need at a basic/medium/advanced tier,`,
              `and common pitfalls. Favour judgment over syntax.`,
            ].join(" "),
          },
        ],
      }),
    });

    if (!res.ok) {
      log.warn({ status: res.status, technologyName }, "tech_research_ground_http_error");
      return { text: "", citations: [] };
    }

    const data = (await res.json()) as ChatResponse;
    const message = data.choices?.[0]?.message;
    const body = message?.content?.trim() ?? "";

    if (body.length === 0) {
      log.warn({ technologyName, error: data.error?.message }, "tech_research_ground_empty");
    }

    return { text: truncate(body), citations: collectCitations(message?.annotations) };
  } catch (err) {
    log.warn({ err, technologyName }, "tech_research_ground_failed");
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

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);

    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)\]"']+/);

  return match ? match[0].replace(/[.,;]+$/, "") : null;
}

const RESOLVE_DOCS_URL_TIMEOUT_MS = 20_000;

/**
 * Bare-name candidate gathering's first step: finds the likely official
 * documentation homepage for a technology via a targeted web search, so the
 * same llms.txt-first chain a doc-URL creation already runs can run against
 * it too. Returns null when nothing confident turns up — candidate
 * gathering simply skips the docs-chain tier in that case, it does not
 * fail the whole request (see architecture.md's Failure modes).
 */
export async function resolveOfficialDocsUrl(technologyName: string): Promise<string | null> {
  const env = loadEnv();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_DOCS_URL_TIMEOUT_MS);

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
        tools: [{ type: "openrouter:web_search", max_results: 3 }],
        messages: [
          {
            role: "user",
            content: `Find the single official documentation homepage URL for the technology "${technologyName}". Reply with only that URL and nothing else.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      log.warn({ status: res.status, technologyName }, "resolve_official_docs_url_http_error");
      return null;
    }

    const data = (await res.json()) as ChatResponse;
    const message = data.choices?.[0]?.message;
    const fromCitation = collectCitations(message?.annotations).find(isHttpUrl);

    if (fromCitation) {
      return fromCitation;
    }

    return extractFirstUrl(message?.content ?? "");
  } catch (err) {
    log.warn({ err, technologyName }, "resolve_official_docs_url_failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface TrustedSourceCandidate {
  url: string;
  title: string;
  discoveryTier: "trusted_search";
}

/**
 * The general trusted-source search tier: runs unconditionally alongside
 * the docs-site chain (never instead of it), specifically asking for
 * official blogs and research papers rather than an open query — this is
 * what lets a caching-pattern or published-algorithm request find real
 * material even when there's no single docs site to anchor on.
 */
export async function gatherTrustedSourceCandidates(
  technologyName: string,
): Promise<TrustedSourceCandidate[]> {
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
              `Search for official engineering blog posts, well-established company engineering`,
              `blogs, and research papers about: ${technologyName}.`,
              `Examples of the kind of source to prefer (non-exhaustive — search broadly, this is`,
              `just illustrative): OpenAI, Anthropic, Google/Gemini, and Vercel engineering blogs.`,
              `Prefer primary, authoritative sources over tutorials, forum posts, or SEO content.`,
            ].join(" "),
          },
        ],
      }),
    });

    if (!res.ok) {
      log.warn({ status: res.status, technologyName }, "trusted_source_candidates_http_error");
      return [];
    }

    const data = (await res.json()) as ChatResponse;
    const citations = collectCitations(data.choices?.[0]?.message?.annotations);

    return citations
      .filter(isHttpUrl)
      .map((url) => ({
        url,
        title: `Trusted source (blog/paper): ${url}`,
        discoveryTier: "trusted_search" as const,
      }));
  } catch (err) {
    log.warn({ err, technologyName }, "trusted_source_candidates_failed");
    return [];
  } finally {
    clearTimeout(timer);
  }
}
