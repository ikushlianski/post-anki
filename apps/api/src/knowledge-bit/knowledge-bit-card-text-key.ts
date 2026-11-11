const CLOZE_MARKUP = /\{\{c\d+::(.*?)(?:::.*?)?\}\}/g;
const PUNCTUATION = /[!-/:-@[-`{-~«»“”‘’„…—–·¿¡]/g;

function normalizeCardText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(CLOZE_MARKUP, "$1")
    .toLowerCase()
    .replace(PUNCTUATION, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cardTextKey(prompt: string, answer: string): string {
  return `${normalizeCardText(prompt)}|${normalizeCardText(answer)}`;
}
