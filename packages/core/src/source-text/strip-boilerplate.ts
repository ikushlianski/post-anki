const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const BLOCK_ELEMENT_PATTERN =
  /<(script|style|nav|header|footer|aside|form|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi;
const SELF_CLOSING_SVG_PATTERN = /<svg\b[^>]*\/>/gi;

// Regex-based, not nesting-aware: the backreference (\1) matches the same
// tag name on open and close, which is correct as long as that element type
// never nests inside itself — true in practice for all of
// script/style/nav/header/footer/aside/form/svg/noscript. This repo
// deliberately has no HTML parser, so this is the documented tradeoff
// rather than something to special-case further.
export function stripBoilerplate(html: string): string {
  return html
    .replace(COMMENT_PATTERN, " ")
    .replace(BLOCK_ELEMENT_PATTERN, " ")
    .replace(SELF_CLOSING_SVG_PATTERN, " ");
}
