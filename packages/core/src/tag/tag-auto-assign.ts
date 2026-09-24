export const TAG_TAXONOMY_CAP = 40;

export function isUnderTaxonomyCap(tagCount: number, cap: number = TAG_TAXONOMY_CAP): boolean {
  return tagCount < cap;
}

export function buildTagMatchPrompt(
  candidateName: string,
  context: string | undefined,
  existingTagNames: string[],
  forceMatch: boolean,
): string {
  const lines = [
    `<candidate>${candidateName}</candidate>`,
    context ? `<context>${context}</context>` : null,
    "",
    "Existing tags:",
    existingTagNames.length > 0
      ? existingTagNames.map((name) => `- ${name}`).join("\n")
      : "(no tags exist yet)",
    "",
    forceMatch
      ? "The taxonomy is at its cap — you must pick the single nearest existing tag, even if imperfect."
      : "Pick an existing tag only if it's genuinely close in meaning; otherwise say no match.",
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}
