const ENGLISH_YES_NO_START =
  /^\s*(?:is|are|was|were|does|do|did|can|could|will|would|should|has|have|had)\s/iu;
const RUSSIAN_YES_NO = /^\s*[\p{L}-]+\s+ли(?![\p{L}])/iu;
const YES_NO_ANSWER = /^\s*(?:да|нет|yes|no)(?![\p{L}\p{N}-])/iu;

export function isYesNoQuestion(question: string, answer: string): boolean {
  return (
    ENGLISH_YES_NO_START.test(question) || RUSSIAN_YES_NO.test(question) || YES_NO_ANSWER.test(answer)
  );
}
