import { describe, expect, it } from "vitest";
import { buildPhraseLesson, pickSentences, type MeetingPhraseAgentOutput } from "./meeting-phrase-draft.js";
import { validateSourceItem, validateSourceItems } from "./knowledge-bit-source-item-validation.js";

const CHUNK = "Phrase: touch base";
const SOURCE = { phrase: "touch base", hint: null, unsure: false };

function output(overrides: Partial<MeetingPhraseAgentOutput> = {}): MeetingPhraseAgentOutput {
  return {
    russianMeaning: "Коротко связаться",
    russianAlt: "Выйти на связь",
    simpleExplanation: "to talk to someone for a short time",
    context: "",
    looksNonNative: false,
    suggestion: "",
    ...overrides,
  };
}

const sentence = (text: string, meaning = "Связаться") => ({ text, meaning });

describe("buildPhraseLesson", () => {
  it("should carry the context as its own field and leave it off when the model gave none", () => {
    const withContext = buildPhraseLesson(SOURCE, output({ context: "In a team chat" }), CHUNK);
    const without = buildPhraseLesson(SOURCE, output({ context: "  " }), CHUNK);

    expect(withContext.cards[0]?.context).toBe("In a team chat");
    expect(without.cards[0]).not.toHaveProperty("context");
  });

  it("should keep the phrase as the user wrote it on the back", () => {
    const lesson = buildPhraseLesson(SOURCE, output({ suggestion: "touch base soon" }), CHUNK);

    expect(lesson.cards[0]?.answer).toBe("touch base");
    expect(lesson.statement).toBe("touch base");
  });

  it("should flag a phrase the user marked unsure even when the model finds it fine", () => {
    const lesson = buildPhraseLesson({ ...SOURCE, unsure: true }, output(), CHUNK);

    expect(lesson.reviewFlag).toBe("non_native_phrase");
    expect(lesson.aiSuggestion).toBeNull();
  });

  it("should flag a non-native phrase and keep the better version beside it", () => {
    const lesson = buildPhraseLesson(
      SOURCE,
      output({ looksNonNative: true, suggestion: "catch up" }),
      CHUNK,
    );

    expect(lesson.reviewFlag).toBe("non_native_phrase");
    expect(lesson.aiSuggestion).toBe("catch up");
  });

  it("should drop the flag when the suggestion is the same phrase apart from case and punctuation", () => {
    const lesson = buildPhraseLesson(
      SOURCE,
      output({ looksNonNative: true, suggestion: "Touch base!" }),
      CHUNK,
    );

    expect(lesson.reviewFlag).toBeUndefined();
    expect(lesson.aiSuggestion).toBeNull();
  });

  it("should drop the suggestion when the phrase is not flagged", () => {
    const lesson = buildPhraseLesson(SOURCE, output({ suggestion: "catch up" }), CHUNK);

    expect(lesson.aiSuggestion).toBeNull();
    expect(lesson.reviewFlag).toBeUndefined();
  });

  it("should drop the model's non-native flag when it gave no better version to show", () => {
    const lesson = buildPhraseLesson(SOURCE, output({ looksNonNative: true }), CHUNK);

    expect(lesson.reviewFlag).toBeUndefined();
    expect(lesson.aiSuggestion).toBeNull();
  });

  it("should still flag an unsure phrase without a suggestion and show only the original", () => {
    const lesson = buildPhraseLesson({ ...SOURCE, unsure: true }, output({ looksNonNative: true }), CHUNK);

    expect(lesson.reviewFlag).toBe("non_native_phrase");
    expect(lesson.aiSuggestion).toBeNull();
  });

  it("should import a three-letter phrase such as FYI instead of failing it on quote length", () => {
    const chunk = "Phrase: FYI";
    const lesson = buildPhraseLesson({ ...SOURCE, phrase: "FYI" }, output({ russianMeaning: "", russianAlt: "" }), chunk);
    const result = validateSourceItems([lesson], chunk);

    expect(result.valid).toHaveLength(1);
    expect(result.dropped).toEqual([]);
  });

  it("should not reject a very short phrase because of the quote length minimum", () => {
    const chunk = "Phrase: wrap up";
    const lesson = buildPhraseLesson({ ...SOURCE, phrase: "wrap up" }, output({ russianMeaning: "", russianAlt: "" }), chunk);
    const card = lesson.cards[0];

    expect(card && validateSourceItem(card, chunk).ok).toBe(true);
  });
});

describe("pickSentences", () => {
  const texts = ["Let's touch base on Friday.", "I will touch base with her.", "TOUCH BASE soon, please!"];
  const given = texts.map((text) => sentence(text));

  it("should keep at most three sentences with a blanked front and the chunk meaning", () => {
    const picked = pickSentences(SOURCE, output({ sentences: [...given, sentence("Can we touch base now?")] }));

    expect(picked?.map((item) => item.sentence)).toEqual(texts);
    expect(picked?.[0]).toEqual({
      sentence: "Let's touch base on Friday.",
      chunk: "touch base",
      meaning: "Связаться",
      blanked: "Let's ____ on Friday.",
    });
  });

  it("should drop a sentence that rewords the phrase", () => {
    const picked = pickSentences(SOURCE, output({ sentences: [sentence("Let's make contact with the base later."), given[0] ?? sentence("")] }));

    expect(picked?.map((item) => item.sentence)).toEqual([texts[0]]);
  });

  it("should drop a sentence where the phrase appears twice", () => {
    expect(pickSentences(SOURCE, output({ sentences: [sentence("Touch base, then touch base again.")] }))).toBeNull();
  });

  it("should drop a sentence without a translation", () => {
    expect(pickSentences(SOURCE, output({ sentences: [sentence(texts[0] ?? "", " ")] }))).toBeNull();
  });

  it("should drop a sentence whose whole front would be too long for a card", () => {
    const long = `${"word ".repeat(40)}touch base`;

    expect(pickSentences(SOURCE, output({ sentences: [sentence(long, "я".repeat(100))] }))).toBeNull();
  });

  it("should drop repeated sentences", () => {
    const picked = pickSentences(SOURCE, output({ sentences: [given[0] ?? sentence(""), sentence("  let's touch base on friday ")] }));

    expect(picked?.map((item) => item.sentence)).toEqual([texts[0]]);
  });

  it("should use the AI-corrected phrase as the target when the phrase is flagged", () => {
    const picked = pickSentences(
      SOURCE,
      output({ looksNonNative: true, suggestion: "catch up", sentences: [sentence("Let's touch base."), sentence("Let's catch up.")] }),
    );

    expect(picked?.map((item) => item.blanked)).toEqual(["Let's ____."]);
  });

  it("should return nothing when no sentence keeps the phrase", () => {
    expect(pickSentences(SOURCE, output({ sentences: [sentence("Nothing relevant here.")] }))).toBeNull();
    expect(pickSentences(SOURCE, output())).toBeNull();
  });
});

describe("pickSentences with a core chunk", () => {
  const long = { phrase: "get organizational inertia on it", hint: null, unsure: false };

  it("should blank only the core chunk and leave the rest of the learner's phrase in view", () => {
    const picked = pickSentences(
      long,
      output({ chunk: "organizational inertia", sentences: [sentence("We need to get organizational inertia on it before Q3.", "Организационный импульс")] }),
    );

    expect(picked?.[0]?.blanked).toBe("We need to get ____ on it before Q3.");
    expect(picked?.[0]?.chunk).toBe("organizational inertia");
  });

  it("should fall back to the whole phrase when the chunk is not part of it or is too long", () => {
    const text = "We need to get organizational inertia on it before Q3.";

    expect(pickSentences(long, output({ chunk: "something else", sentences: [sentence(text)] }))?.[0]?.chunk).toBe(long.phrase);
    expect(pickSentences(long, output({ chunk: long.phrase, sentences: [sentence(text)] }))?.[0]?.chunk).toBe(long.phrase);
  });

  it("should never put a letter hint on the front", () => {
    const picked = pickSentences(SOURCE, output({ sentences: [sentence("Let's touch base on Friday.")] }));

    expect(picked?.[0]).not.toHaveProperty("hint");
  });
});

describe("buildPhraseLesson with sentences", () => {
  const sentences = [
    sentence("Let's touch base on Friday.", "Связаться в пятницу"),
    sentence("I will touch base with her.", "Связаться с ней"),
  ];

  function lessonFor(overrides: Partial<MeetingPhraseAgentOutput> = {}) {
    const out = output({ sentences, context: "In a call", ...overrides });

    return buildPhraseLesson(SOURCE, out, CHUNK, pickSentences(SOURCE, out));
  }

  it("should put the blanked sentence and the Russian meaning of the chunk on the front and the chunk on the back", () => {
    const [first] = lessonFor().cards;

    expect(first?.question).toBe("Let's ____ on Friday.\nСвязаться в пятницу");
    expect(first?.answer).toBe("touch base");
    expect(first?.context).toBe("In a call");
  });

  it("should add the four other wordings as extra cards answered by the bare phrase", () => {
    const cards = lessonFor({ situation: "You want a short catch-up with a colleague." }).cards.slice(2);

    expect(cards.map((card) => card.question)).toEqual([
      "You want a short catch-up with a colleague.",
      "Коротко связаться",
      "Выйти на связь",
      "to talk to someone for a short time",
    ]);
    expect(cards.map((card) => card.answer)).toEqual(Array(4).fill("touch base"));
    expect(lessonFor().statement).toBe("touch base");
  });

  it("should leave out a wording that contains the phrase or one of its key words", () => {
    const cards = lessonFor({ simpleExplanation: "to touch someone briefly", russianAlt: "Touch base" }).cards.slice(2);

    expect(cards.map((card) => card.question)).toEqual(["Коротко связаться"]);
  });

  it("should leave out a repeated wording", () => {
    const cards = lessonFor({ russianAlt: "коротко связаться" }).cards.slice(2);

    expect(cards).toHaveLength(2);
  });

  it("should use the AI-corrected phrase as the bare answer of the extra cards when flagged", () => {
    const out = output({ looksNonNative: true, suggestion: "catch up", sentences: [sentence("Let's catch up.")] });
    const lesson = buildPhraseLesson(SOURCE, out, CHUNK, pickSentences(SOURCE, out));

    expect(lesson.cards.at(-1)?.answer).toBe("catch up");
  });

  it("should fall back to the wordings alone with the phrase on the back when no sentence is usable", () => {
    const lesson = buildPhraseLesson(SOURCE, output(), CHUNK);

    expect(lesson.cards.map((card) => card.answer)).toEqual(["touch base", "touch base", "touch base"]);
    expect(lesson.cards[0]?.question).toBe("Коротко связаться");
  });

  it("should produce cards that pass the card validation", () => {
    const chunk = "Phrase: touch base\nHint: связаться";
    const lesson = buildPhraseLesson(SOURCE, output({ sentences }), chunk, pickSentences(SOURCE, output({ sentences })));
    const result = validateSourceItems([lesson], chunk);

    expect(result.dropped).toEqual([]);
    expect(result.valid[0]?.cards).toHaveLength(5);
  });
});

describe("wrong-language check for phrase cards", () => {
  const lesson = () =>
    buildPhraseLesson(
      SOURCE,
      output({ sentences: [sentence("Let's touch base on Friday.", "Связаться в пятницу и обсудить дела")] }),
      CHUNK,
    );

  it("should accept a phrase front with a Russian translation and a pure Russian front", () => {
    const result = validateSourceItems([lesson()], CHUNK, true);

    expect(result.dropped).toEqual([]);
    expect(result.valid[0]?.cards.length).toBeGreaterThanOrEqual(3);
  });

  it("should still reject the same Russian fronts when the pipeline is not the phrase pipeline", () => {
    const result = validateSourceItems([lesson()], CHUNK);

    expect(result.dropped).toContain("wrong_language");
  });

  it("should reject an ordinary mostly Cyrillic item over an English source", () => {
    const item = {
      kind: "basic" as const,
      statement: "Teams review results weekly.",
      question: "Как часто команды проверяют результаты работы?",
      answer: "Каждую неделю",
      quote: "Teams review results weekly",
    };
    const source = "Teams review results weekly and plan the next sprint.";

    expect(validateSourceItem(item, source)).toEqual({ ok: false, reason: "wrong_language" });
    expect(validateSourceItem(item, source, true).ok).toBe(true);
  });
});
