const MARKDOWN_EXTENSION_PATTERN = /\.md$/i;

const IGNORED_BASENAMES = new Set([
  "readme",
  "contributing",
  "license",
  "code_of_conduct",
  "changelog",
]);

// A repository markdown file counts as a book chapter unless it is one of
// the well-known non-content files (README, LICENSE, ...) or lives under
// .github/ (issue templates, workflow docs).
export function isChapterCandidatePath(path: string): boolean {
  if (!MARKDOWN_EXTENSION_PATTERN.test(path)) {
    return false;
  }

  const lowerPath = path.toLowerCase();

  if (lowerPath.startsWith(".github/") || lowerPath.includes("/.github/")) {
    return false;
  }

  const basename = path.split("/").pop() ?? path;
  const nameWithoutExtension = basename.replace(MARKDOWN_EXTENSION_PATTERN, "");

  return !IGNORED_BASENAMES.has(nameWithoutExtension.toLowerCase());
}
