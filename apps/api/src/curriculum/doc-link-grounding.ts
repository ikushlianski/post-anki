import { looksLikeLlmsTxtContent } from "./curriculum-rules.js";
import { gatherTechResearchGrounding } from "./tech-research-grounding.js";
import { resolveSourceText } from "./source-fetch.js";
import { log } from "../shared/log.js";

const PROBE_TIMEOUT_MS = 8_000;
const MAX_LLMS_TXT_CHARS = 30_000;

export type DocLinkGroundingKind = "llms_txt" | "web_research";

export interface DocLinkGrounding {
  text: string;
  kind: DocLinkGroundingKind;
  title: string;
}

async function probe(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      return null;
    }

    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function truncate(text: string): string {
  return text.length > MAX_LLMS_TXT_CHARS ? text.slice(0, MAX_LLMS_TXT_CHARS) : text;
}

export async function gatherDocLinkGrounding(
  docUrl: string,
  technologyName: string,
): Promise<DocLinkGrounding> {
  const origin = new URL(docUrl).origin;

  const llmsTxt = await probe(`${origin}/llms.txt`);

  if (llmsTxt && looksLikeLlmsTxtContent(llmsTxt)) {
    log.info({ docUrl }, "doc_link_grounding_llms_txt_found");

    return { text: truncate(llmsTxt), kind: "llms_txt", title: `llms.txt: ${docUrl}` };
  }

  const llmsFullTxt = await probe(`${origin}/llms-full.txt`);

  if (llmsFullTxt && looksLikeLlmsTxtContent(llmsFullTxt)) {
    log.info({ docUrl }, "doc_link_grounding_llms_full_txt_found");

    return {
      text: truncate(llmsFullTxt),
      kind: "llms_txt",
      title: `llms-full.txt: ${docUrl}`,
    };
  }

  log.info({ docUrl }, "doc_link_grounding_anchored_fallback");

  const siteHost = new URL(docUrl).host;

  const [siteSearch, pageText] = await Promise.all([
    gatherTechResearchGrounding(technologyName, siteHost),
    resolveSourceText("link", docUrl),
  ]);

  const combined = [siteSearch.text, pageText]
    .filter((part) => part.trim().length > 0)
    .join("\n\n---\n\n");

  return {
    text: combined,
    kind: "web_research",
    title: `Auto-researched (site-anchored): ${docUrl}`,
  };
}
