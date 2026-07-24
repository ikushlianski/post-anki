import { extractSameSiteLinks } from "@post-anki/core";
import { looksLikeLlmsTxtContent } from "./curriculum-rules.js";
import { log } from "../shared/log.js";

const PROBE_TIMEOUT_MS = 8_000;
const MAX_LLMS_TXT_CHARS = 30_000;
const CRAWL_LINK_CAP = 8;

export interface DocSiteCandidate {
  url: string;
  title: string;
  discoveryTier: "llms_txt" | "docs_crawl";
  kind: "llms_txt" | "link";
  fetchedText: string | null;
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

const CONTROL_CHARS_EXCEPT_WHITESPACE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g",
);

function truncate(text: string): string {
  const sanitized = text.replace(CONTROL_CHARS_EXCEPT_WHITESPACE, " ");

  return sanitized.length > MAX_LLMS_TXT_CHARS
    ? sanitized.slice(0, MAX_LLMS_TXT_CHARS)
    : sanitized;
}

/**
 * Candidate gathering's docs-site chain: llms.txt, then llms-full.txt (each
 * candidate's content is already in hand from the existence probe, so it's
 * stored immediately rather than deferred), then — new — a bounded
 * single-hop crawl of the entry page's own same-site links when neither
 * well-known file exists. Crawl-tier candidates are NOT fetched in full
 * here; only their URLs are collected, deferring the cost of a full fetch
 * until the learner actually approves one (see architecture.md's decision
 * on why crawl/search candidates stay unfetched until approval).
 */
export async function gatherDocSiteCandidates(docUrl: string): Promise<DocSiteCandidate[]> {
  const origin = new URL(docUrl).origin;

  const llmsTxt = await probe(`${origin}/llms.txt`);

  if (llmsTxt && looksLikeLlmsTxtContent(llmsTxt)) {
    log.info({ docUrl }, "doc_link_grounding_llms_txt_found");

    return [
      {
        url: docUrl,
        title: `llms.txt: ${docUrl}`,
        discoveryTier: "llms_txt",
        kind: "llms_txt",
        fetchedText: truncate(llmsTxt),
      },
    ];
  }

  const llmsFullTxt = await probe(`${origin}/llms-full.txt`);

  if (llmsFullTxt && looksLikeLlmsTxtContent(llmsFullTxt)) {
    log.info({ docUrl }, "doc_link_grounding_llms_full_txt_found");

    return [
      {
        url: docUrl,
        title: `llms-full.txt: ${docUrl}`,
        discoveryTier: "llms_txt",
        kind: "llms_txt",
        fetchedText: truncate(llmsFullTxt),
      },
    ];
  }

  log.info({ docUrl }, "doc_link_grounding_crawl_fallback");

  const entry: DocSiteCandidate = {
    url: docUrl,
    title: `Official docs: ${docUrl}`,
    discoveryTier: "docs_crawl",
    kind: "link",
    fetchedText: null,
  };

  const html = await probe(docUrl);

  if (!html) {
    return [entry];
  }

  const links = extractSameSiteLinks(html, origin, CRAWL_LINK_CAP).filter(
    (url) => url !== docUrl,
  );

  const crawled: DocSiteCandidate[] = links.map((url) => ({
    url,
    title: `Official docs: ${url}`,
    discoveryTier: "docs_crawl",
    kind: "link",
    fetchedText: null,
  }));

  return [entry, ...crawled];
}
