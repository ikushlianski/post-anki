const CLOZE_MARKER = /\{\{c\d+::([\s\S]+?)(?:::[^}]*)?\}\}/gi;
const BACK_EXTRA_LABEL = /^Back Extra:[ \t]*/gim;
const BLANK_RUN = /\n{3,}/g;

export function hasClozeMarkup(raw: string): boolean {
  return /\{\{c\d+::/i.test(raw);
}

export function importedFactText(raw: string): string {
  return raw.replace(CLOZE_MARKER, "$1").replace(BACK_EXTRA_LABEL, "").replace(BLANK_RUN, "\n\n");
}
