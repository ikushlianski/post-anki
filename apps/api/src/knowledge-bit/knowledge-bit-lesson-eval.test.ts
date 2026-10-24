import { readFileSync } from "node:fs";
import { BUSINESS_LEARNING_INTENT } from "@post-anki/shared";
import { describe, expect, it, vi } from "vitest";

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("../mastra/mastra.js", () => ({
  getMastra: vi.fn().mockReturnValue({
    getAgent: vi.fn().mockReturnValue({ generate: generateMock }),
  }),
  AGENT_KEYS: { knowledgeBitLessons: "knowledgeBitLessons", knowledgeBitSourceItems: "knowledgeBitSourceItems" },
}));

vi.mock("../shared/env.js", () => ({
  loadEnv: vi.fn().mockReturnValue({ OPENROUTER_BASE_URL: undefined }),
}));

vi.mock("../mastra/generate-with-retry.js", () => ({
  generateWithRetry: vi.fn((_op: string, _curriculumId: unknown, _agentKey: string, fn: () => unknown) => fn()),
}));

import { runKnowledgeBitSourceItems } from "../mastra/knowledge-bit-source-items.agent.js";
import { checkLessons, findFirstPersonWord } from "./knowledge-bit-lesson-eval.checks.js";
import { validateSourceItems } from "./knowledge-bit-source-item-validation.js";

const FIXTURE = readFileSync(new URL("./knowledge-bit-lesson-eval.fixture.ru.txt", import.meta.url), "utf8");

const LESSONS = [
  {
    lesson: "Наёмный работник зависит от чужого бизнеса, и его деньги заканчиваются вместе с месяцем.",
    quote: "я работал на чужой бизнес, а мои деньги заканчивались ровно тогда, когда заканчивался месяц",
    example: "Десять лет работы по найму не дали человеку ничего, кроме зарплаты до конца месяца.",
  },
  {
    lesson:
      "Предприниматель отличается от наёмного работника тем, что платит за свои ошибки собственными деньгами и учится на них быстрее остальных.",
    quote: "платит за свои ошибки собственными деньгами и учится на них быстрее остальных",
    example: "Владелец магазинов прогорел с первым и вторым магазином, но превратил каждую неудачу в урок.",
  },
  {
    lesson: "Школа учит избегать ошибок, а бизнес вознаграждает тех, кто умеет на них учиться.",
    quote: "Школа учит избегать ошибок, а бизнес вознаграждает тех, кто умеет на них учиться",
  },
];

const CARDS = [
  {
    lessonIndex: 0,
    statement: "Наёмный работник зависит от чужого бизнеса, поэтому его доход ограничен зарплатой.",
    question: "Почему доход наёмного работника ограничен зарплатой?",
    answer: "Потому что он работает на чужой бизнес и получает фиксированную плату.",
    kind: "why" as const,
  },
  {
    lessonIndex: 1,
    statement: "Предприниматель платит за свои ошибки собственными деньгами и учится на них.",
    question: "Чем предприниматель отличается от наёмного работника в отношении ошибок?",
    answer: "Он платит за ошибки собственными деньгами и учится на них быстрее остальных.",
    kind: "basic" as const,
  },
  {
    lessonIndex: 1,
    statement: "Предприниматель превращает каждую неудачу в урок.",
    question: "Что предприниматель делает с каждой неудачей, чтобы расти?",
    answer: "Превращает её в урок.",
    kind: "basic" as const,
  },
  {
    lessonIndex: 2,
    statement: "Бизнес вознаграждает тех, кто умеет учиться на своих ошибках.",
    question: "Кого вознаграждает бизнес в отличие от школы?",
    answer: "Тех, кто умеет учиться на ошибках, а не избегать их.",
    kind: "basic" as const,
  },
];

describe("lesson extraction evaluation on a first-person school-grades story", () => {
  it("should yield at most three principle lessons and six cards with no narrator voice and verbatim quotes", async () => {
    generateMock.mockResolvedValueOnce({ object: { lessons: LESSONS }, usage: {} });
    generateMock.mockResolvedValueOnce({ object: { cards: CARDS }, usage: {} });

    const lessons = await runKnowledgeBitSourceItems(FIXTURE, {
      modelId: "openrouter/google/gemma-4-31b-it",
      learningIntent: BUSINESS_LEARNING_INTENT,
    });
    const checks = checkLessons(lessons, FIXTURE);

    expect(lessons).toHaveLength(3);
    expect(checks.filter((check) => !check.passed)).toEqual([]);
    expect(validateSourceItems(lessons, FIXTURE).dropped).toEqual([]);
  });

  it("should flag a lesson that keeps the narrator's first-person voice and a quote missing from the story", () => {
    const checks = checkLessons(
      [
        {
          statement: "Я получал пятёрки, но мои деньги заканчивались в конце месяца.",
          quote: "Я получал одни двойки и очень гордился этим",
          example: null,
          cards: [],
        },
      ],
      FIXTURE,
    );

    expect(checks.filter((check) => !check.passed).map((check) => check.name)).toEqual([
      "card count",
      "no first person",
      "quotes in source",
    ]);
  });

  it("should recognise first-person words only as whole words", () => {
    expect(findFirstPersonWord("Мы привыкли считать оценки гарантией")).toBe("Мы");
    expect(findFirstPersonWord("Мысль о системе приносит доход")).toBeNull();
  });
});
