import { validateLesson } from "./knowledge-bit-lesson-validation.js";

export type NothingExtractedEvalExpectation = "card" | "nothing";

export interface NothingExtractedEvalCase {
  name: string;
  expectation: NothingExtractedEvalExpectation;
  text: string;
  supportingQuote?: string;
}

export const NOTHING_EXTRACTED_EVAL_CASES: readonly NothingExtractedEvalCase[] = [
  {
    name: "one-sentence pricing rule",
    expectation: "card",
    text: "Never discount to win a deal before you know the client's budget, because a discount cannot be taken back.",
    supportingQuote: "a discount cannot be taken back",
  },
  {
    name: "short hiring criterion",
    expectation: "card",
    text: "Hire for the slowest-changing trait first. Skills can be taught in weeks, but judgement and reliability rarely change.",
    supportingQuote: "Skills can be taught in weeks",
  },
  {
    name: "short note in Russian",
    expectation: "card",
    text: "Цена без знания себестоимости — это угадывание: каждая продажа может приносить убыток.",
    supportingQuote: "каждая продажа может приносить убыток",
  },
  {
    name: "greeting and sign-off",
    expectation: "nothing",
    text: "Hi everyone, thanks for coming today. See you all next week, have a nice evening!",
  },
  {
    name: "filler small talk",
    expectation: "nothing",
    text: "Well, so, yeah. Anyway, um, the weather was great, wasn't it? Right, okay, let's see, ha ha, never mind.",
  },
  {
    name: "pure narrative without takeaway",
    expectation: "nothing",
    text: "On Tuesday we walked to the station. It was raining a little. We bought coffee and sat by the window until the train arrived.",
  },
];

export function cardCaseQuoteIsValid(testCase: NothingExtractedEvalCase): boolean {
  if (!testCase.supportingQuote) {
    return false;
  }

  return validateLesson({ statement: testCase.text, quote: testCase.supportingQuote }, testCase.text).ok;
}
