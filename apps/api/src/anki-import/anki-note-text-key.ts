const CLOZE = /\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g;

export function ankiNoteTextKey(rawText: string): string {
  return rawText.replace(CLOZE, "$1").replace(/\s+/g, " ").trim().toLowerCase();
}
