const UNSURE_MARKER = /\(\s*\?+\s*\)|[?!]*\?[?!]*\?[?!]*\?[?!]*/g;

export interface UnsureMarkerResult {
  text: string;
  unsure: boolean;
}

export function detectUnsureMarker(text: string): UnsureMarkerResult {
  const unsure = new RegExp(UNSURE_MARKER.source).test(text);

  if (!unsure) {
    return { text, unsure: false };
  }

  return { text: text.replace(UNSURE_MARKER, " ").replace(/\s+/g, " ").trim(), unsure: true };
}
