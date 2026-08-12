import { decodeHtmlEntities } from "./decode-html-entities";
import { selectContentRegion } from "./select-content-region";
import { stripBoilerplate } from "./strip-boilerplate";

const STRUCTURAL_TAG_PATTERN =
  /<\/?(?:!doctype|html|head|body|div|span|p|a|ul|ol|li|table|thead|tbody|tr|td|th|nav|header|footer|main|article|aside|section|script|style|form|svg|img|br|hr|h[1-6]|strong|em|b|i|pre|code|blockquote)(?:[\s/>]|$)/i;
const TAG_PATTERN = /<[^>]+>/g;
const WHITESPACE_PATTERN = /\s+/g;

// Distinguishes real HTML from plain text/markdown by requiring a known
// structural tag name, not just any "<...>" shape — markdown autolinks like
// <https://example.com> would otherwise false-positive as a tag.
function looksLikeHtml(text: string): boolean {
  return STRUCTURAL_TAG_PATTERN.test(text);
}

// Regex-based extraction, deliberately without an HTML parser (see the
// module-level notes in select-content-region.ts and strip-boilerplate.ts).
// Markdown/plain text passes through close to intact so headings and
// structure survive; HTML goes through, in order:
//   1. pick the <main>/<article> region when one exists, so chrome outside
//      it (site nav, breadcrumbs, cookie banners, footer) is never
//      considered at all
//   2. strip boilerplate elements that live INSIDE that region too — a
//      docs page can nest an in-page table-of-contents <nav> inside <main>
//   3. strip whatever tags remain
//   4. decode entities
//   5. collapse whitespace
export function extractSourceText(raw: string): string {
  if (!looksLikeHtml(raw)) {
    return raw.trim();
  }

  const region = selectContentRegion(raw);
  const withoutBoilerplate = stripBoilerplate(region);
  const withoutTags = withoutBoilerplate.replace(TAG_PATTERN, " ");
  const decoded = decodeHtmlEntities(withoutTags);

  return decoded.replace(WHITESPACE_PATTERN, " ").trim();
}
