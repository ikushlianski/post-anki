export interface OptionExplanation {
  text: string;
  citationUrl: string | null;
}

const URL_PATTERN = /https?:\/\/[^\s)"'<>]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? [];

  return matches.map((url) => url.replace(TRAILING_PUNCTUATION, ""));
}

export function sanitizeCitationUrl(
  url: string | null,
  knownUrls: string[],
): string | null {
  if (url === null) {
    return null;
  }

  return knownUrls.includes(url) ? url : null;
}

export function sanitizeOptionExplanations(
  explanations: OptionExplanation[],
  knownUrls: string[],
): OptionExplanation[] {
  return explanations.map((explanation) => ({
    text: explanation.text,
    citationUrl: sanitizeCitationUrl(explanation.citationUrl, knownUrls),
  }));
}

const PLACEHOLDER_EXPLANATION: OptionExplanation = {
  text: "No explanation available.",
  citationUrl: null,
};

export function alignOptionExplanations(
  options: string[],
  explanations: OptionExplanation[],
): OptionExplanation[] {
  return options.map((_, index) => explanations[index] ?? PLACEHOLDER_EXPLANATION);
}
