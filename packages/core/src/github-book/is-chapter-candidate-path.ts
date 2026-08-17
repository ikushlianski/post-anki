import {
  dropLeadingOrdinalToken,
  meaningfulNameTokens,
  stripMarkdownExtension,
} from "./filename-tokens";

const MARKDOWN_EXTENSION_PATTERN = /\.md$/i;

const IGNORED_BASENAMES = new Set([
  "readme",
  "contributing",
  "license",
  "code_of_conduct",
  "changelog",
  "dedication",
  "acknowledgment",
  "acknowledgments",
  "acknowledgement",
  "acknowledgements",
  "foreword",
  "preface",
  "glossary",
  "index",
  "index_of_terms",
]);

// A repository markdown file counts as a book chapter unless it is one of
// the well-known non-content files (README, LICENSE, ...), ceremonial front
// matter that isn't study material (dedication, acknowledgment, foreword,
// ...), or lives under .github/ (issue templates, workflow docs). Matching
// looks at the meaningful name — the hash and any leading ordinal
// ("01-Dedication-<hash>.md") stripped off — not the raw basename, so a
// numbered front-matter file still gets caught. Genuinely substantive front
// matter, such as an introduction, is deliberately not in this list.
export function isChapterCandidatePath(path: string, repoName?: string): boolean {
  if (!MARKDOWN_EXTENSION_PATTERN.test(path)) {
    return false;
  }

  const lowerPath = path.toLowerCase();

  if (lowerPath.startsWith(".github/") || lowerPath.includes("/.github/")) {
    return false;
  }

  const basename = path.split("/").pop() ?? path;
  const meaningful = meaningfulBasename(basename);

  if (IGNORED_BASENAMES.has(meaningful)) {
    return false;
  }

  return !isCompiledWholeBook(path, meaningful, repoName);
}

// A book repository often also publishes the whole book as one compiled
// markdown file at the root, named after the repository itself. Treated as a
// chapter it becomes a module duplicating every real chapter's content —
// which would then be studied twice and generate questions twice. Recognised
// by living at the root AND carrying the repository's own name, so a genuine
// chapter that merely echoes a word from the repo name is unaffected.
function isCompiledWholeBook(
  path: string,
  meaningfulName: string,
  repoName: string | undefined,
): boolean {
  if (!repoName || path.includes("/")) {
    return false;
  }

  return normalizeName(meaningfulName) === normalizeName(repoName);
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function meaningfulBasename(basename: string): string {
  const tokens = meaningfulNameTokens(stripMarkdownExtension(basename));

  return dropLeadingOrdinalToken(tokens).join("_").toLowerCase();
}
