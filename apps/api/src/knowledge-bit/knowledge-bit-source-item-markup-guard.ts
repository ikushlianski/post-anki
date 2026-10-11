const INJECTED_PATTERNS: RegExp[] = [
  /https?:\/\/\S+/giu,
  /\bwww\.\S+/giu,
  /<\/?[a-z][^>]*>/giu,
  /\]\([^)]*\)/gu,
  /\b(?:javascript|vbscript|data):\S*/giu,
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/gu,
];

export function hasInjectedMarkup(texts: readonly string[], sourceText: string): boolean {
  const lowerSource = sourceText.toLowerCase();

  return texts.some((text) =>
    INJECTED_PATTERNS.some((pattern) =>
      (text.match(pattern) ?? []).some((match) => !lowerSource.includes(match.toLowerCase())),
    ),
  );
}
