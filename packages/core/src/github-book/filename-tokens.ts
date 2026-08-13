const MARKDOWN_EXTENSION_PATTERN = /\.md$/i;
const LEADING_ORDINAL_TOKEN_PATTERN = /^\d+$/;

// Shared parsing behind both candidate-path filtering and title derivation:
// a repository filename is shaped like "<name>-<hash>.md",
// "<ordinal>-<name>-<hash>.md" or "Chapter_N-<name>-<hash>.md". Both call
// sites need the same two lossy steps — stripping a Google-Docs-style export
// hash off the trailing "-"-delimited tokens, and (once nothing else about
// the filename signals structure) stripping a bare leading ordinal that only
// encoded pack ordering, not the chapter's real name.
export function stripMarkdownExtension(filename: string): string {
  return filename.replace(MARKDOWN_EXTENSION_PATTERN, "");
}

// The trailing ID cannot be isolated by simply taking "the last '-'-joined
// segment": real export tools (Google Docs -> markdown converters, in
// particular) embed IDs that themselves contain hyphens, so the ID and a
// genuine hyphenated title word (e.g. "Multi-Agent") are shaped the same at
// the string level, and trying to classify each trailing fragment as
// "hash-like" or "word-like" on its own doesn't work either — base64url
// text produces letters-only runs of arbitrary length purely by chance
// ("uPKb", "FZmDgiughno"), and a real title can itself contain a
// digit-bearing acronym ("A2A" in "Inter_Agent_Communication_(A2A)") that
// looks exactly as "hash-like" as a genuine ID fragment.
//
// What real title text never does is START mid-word with a digit — a
// filename's own numbering always lives in its own "-"-token (the leading
// ordinal, or "Chapter_13"), never fused into a name. A Google export ID,
// by contrast, is consistently digit-led at least at its first fragment. So
// instead of asking "does this trailing fragment look like a word", this
// scans left to right, after the first token, for the first token that
// itself starts with a digit and also contains a letter — everything from
// there on is the ID, by construction, whatever individual fragments within
// it happen to look like.
//
// Known limitation: a real title segment that itself starts with a digit
// and contains a letter (e.g. "Chapter_1-3D_Rendering-hash.md") would be
// cut early by this rule. Not exercised by any fixture here; flagged rather
// than engineered around.
//
// Some export tools instead produce an all-letters-then-digits hash
// ("hash2", "abc123") that never triggers the digit-led rule above. For
// that shape, fall back to the original per-token check: scan from the end
// and drop tokens until one is "wordish" — every one of its
// underscore-delimited parts is either all digits or all letters, with none
// mixing the two the way an opaque ID token does.
export function dropTrailingHashTokens(tokens: string[]): string[] {
  for (let index = 1; index < tokens.length; index += 1) {
    if (isHashStartToken(tokens[index]!)) {
      return tokens.slice(0, index);
    }
  }

  return dropTrailingWordishHashTokens(tokens);
}

function isHashStartToken(token: string): boolean {
  return /^\d/.test(token) && /[A-Za-z]/.test(token);
}

function dropTrailingWordishHashTokens(tokens: string[]): string[] {
  let end = tokens.length;

  while (end > 1 && !isWordishToken(tokens[end - 1]!)) {
    end -= 1;
  }

  return tokens.slice(0, end);
}

function isWordishToken(rawToken: string): boolean {
  const parts = rawToken.replace(/[()]/g, "").split("_").filter((part) => part.length > 0);

  return parts.length > 0 && parts.every(isWordishPart);
}

function isWordishPart(part: string): boolean {
  const hasDigit = /\d/.test(part);
  const hasLetter = /[A-Za-z]/.test(part);

  return hasDigit !== hasLetter;
}

// Once the hash is gone, a bare leading ordinal (e.g. the "04" in
// "04-A_Thought_Leaders...") only encoded where the file sits in the
// directory, not part of its real name — drop it when something else
// remains, and leave it alone if it's all there is.
export function dropLeadingOrdinalToken(tokens: string[]): string[] {
  if (tokens.length > 1 && LEADING_ORDINAL_TOKEN_PATTERN.test(tokens[0]!)) {
    return tokens.slice(1);
  }

  return tokens;
}

// The tokens left over after the hash strip, falling back to the original
// tokens if stripping would otherwise have dropped everything.
export function meaningfulNameTokens(basenameWithoutExtension: string): string[] {
  const tokens = basenameWithoutExtension.split("-").filter((token) => token.length > 0);
  const kept = dropTrailingHashTokens(tokens);

  return kept.length > 0 ? kept : tokens;
}
