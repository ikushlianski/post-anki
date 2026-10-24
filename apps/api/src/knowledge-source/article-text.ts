import { convert } from "html-to-text";

const HIDDEN_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "[hidden]",
  "[aria-hidden='true']",
  "[style*='display:none']",
  "[style*='display: none']",
  "[style*='visibility:hidden']",
  "[style*='visibility: hidden']",
  "[style*='font-size:0']",
  "[style*='font-size: 0']",
];

const BOILERPLATE_SELECTORS = [
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
  "[role='complementary']",
  "[id*='comment' i]",
  "[class*='comment' i]",
  "[id*='cookie' i]",
  "[class*='cookie' i]",
  "[id*='consent' i]",
  "[class*='consent' i]",
  "[id*='advert' i]",
  "[class*='advert' i]",
  "[class~='ad']",
  "[class~='ads']",
  "[id='ad']",
  "[class*='sponsor' i]",
  "[class*='share' i]",
  "[class*='social' i]",
  "[class*='related' i]",
  "[class*='newsletter' i]",
  "[class*='sidebar' i]",
];

const MAIN_CONTENT_PROBES: Array<{ probe: RegExp; selector: string }> = [
  { probe: /itemprop\s*=\s*["']?articleBody/i, selector: "[itemprop='articleBody']" },
  { probe: /<article[\s>]/i, selector: "article" },
  { probe: /<main[\s>]/i, selector: "main" },
  { probe: /role\s*=\s*["']?main/i, selector: "[role='main']" },
];

function skip(selector: string): { selector: string; format: string } {
  return { selector, format: "skip" };
}

export function extractArticleText(html: string): string {
  const main = MAIN_CONTENT_PROBES.find(({ probe }) => probe.test(html));

  return convert(html, {
    ...(main ? { baseElements: { selectors: [main.selector] } } : {}),
    selectors: [...HIDDEN_SELECTORS, ...BOILERPLATE_SELECTORS].map(skip),
  }).trim();
}
