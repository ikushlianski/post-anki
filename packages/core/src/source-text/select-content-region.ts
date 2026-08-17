const MAIN_REGION_PATTERN = /<main\b[^>]*>([\s\S]*)<\/main>/i;
const ARTICLE_REGION_PATTERN = /<article\b[^>]*>([\s\S]*)<\/article>/i;

// Regex-based only — this repo deliberately has no HTML parser (see
// extract-source-text.ts). A greedy match from the first opening tag to the
// last matching closing tag is correct for the common case of a single
// <main> or <article> landmark per document; a page with more than one of
// either is a documented limitation rather than something to special-case.
// <main> wins when both are present, since it names the primary content
// region explicitly; <article> is the fallback signal. When neither exists
// the whole document is returned so callers can still fall back to
// boilerplate stripping over the full body.
export function selectContentRegion(html: string): string {
  const main = MAIN_REGION_PATTERN.exec(html);

  if (main?.[1] !== undefined) {
    return main[1];
  }

  const article = ARTICLE_REGION_PATTERN.exec(html);

  return article?.[1] ?? html;
}
