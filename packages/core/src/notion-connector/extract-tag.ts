const LEADING_TAG = /^(?:#([A-Z0-9]{2,8})|\[([A-Z0-9]{2,8})\]|([A-Z0-9]{2,8}):)(?=\s|$)/;

export interface ExtractedTag {
  tag: string | null;
  body: string;
}

export function extractTag(text: string): ExtractedTag {
  const trimmed = text.trim();
  const match = LEADING_TAG.exec(trimmed);

  if (!match) {
    return { tag: null, body: trimmed };
  }

  const tag = match[1] ?? match[2] ?? match[3] ?? null;

  return { tag, body: trimmed.slice(match[0].length).trim() };
}
