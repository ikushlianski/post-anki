import { isSafeSourceUrl } from "@post-anki/core";
import { loadEnv, type Env } from "../shared/env.js";
import { log } from "../shared/log.js";
import {
  resolveEffectiveModelTier,
  type ResolveEffectiveModelTierScope,
} from "../mastra/tier-resolver.js";
import { tierToModelId } from "../mastra/model-tier.js";

// This module calls OpenRouter directly via fetch() rather than through
// Mastra's Agent (which resolves OPENROUTER_BASE_URL itself via
// resolveAgentModel) — so it must apply the same override manually, or e2e's
// mock server never gets hit and every call here silently 401s and returns
// empty results instead of routing to the mock.
function endpointUrl(env: Env): string {
  return env.OPENROUTER_BASE_URL
    ? `${env.OPENROUTER_BASE_URL.replace(/\/$/, "")}/chat/completions`
    : "https://openrouter.ai/api/v1/chat/completions";
}

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

// cost-tier-model-selection — resolves the same tier cascade
// (resolveEffectiveModelTier -> tierToModelId) every Mastra agent uses via
// dynamicResolvedModel, not a second/duplicated cascade — this module just
// can't reach it through Mastra's Agent since it bypasses Agent entirely.
async function restModel(scope: ResolveEffectiveModelTierScope): Promise<string> {
  const tier = await resolveEffectiveModelTier(scope);

  return tierToModelId(tier).replace(/^openrouter\//, "");
}

async function gatherGrounding(
  instructionParts: string[],
  logContext: Record<string, unknown>,
  scope: ResolveEffectiveModelTierScope,
): Promise<TechResearchGrounding> {
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
        model: await restModel(scope),
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
  scope: ResolveEffectiveModelTierScope = {},
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
    scope,
  );
}

export async function gatherLectureSourceGrounding(
  topicTitle: string,
  curriculumContext?: string,
  scope: ResolveEffectiveModelTierScope = {},
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
    scope,
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

function isSafeCitationUrl(value: string): boolean {
  return isSafeSourceUrl(value).allowed;
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
export async function resolveOfficialDocsUrl(
  technologyName: string,
  scope: ResolveEffectiveModelTierScope = {},
): Promise<string | null> {
  const env = loadEnv();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_DOCS_URL_TIMEOUT_MS);

  try {
    const res = await fetch(endpointUrl(env), {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: await restModel(scope),
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
    const fromCitation = collectCitations(message?.annotations).find(isSafeCitationUrl);

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
  scope: ResolveEffectiveModelTierScope = {},
): Promise<TrustedSourceCandidate[]> {
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
        model: await restModel(scope),
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
      .filter(isSafeCitationUrl)
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
