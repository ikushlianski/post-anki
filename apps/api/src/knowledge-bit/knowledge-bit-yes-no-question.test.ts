import { describe, expect, it } from "vitest";
import { isYesNoQuestion } from "./knowledge-bit-yes-no-question.js";

describe("isYesNoQuestion", () => {
  it("should flag Russian questions built with the particle ли", () => {
    expect(isYesNoQuestion("Существует ли «клиентская боль» в мире корпораций?", "Метафора не существует")).toBe(true);
  });

  it("should flag English questions that start with an auxiliary verb", () => {
    expect(isYesNoQuestion("Does a composite index help queries on b alone?", "It does not help")).toBe(true);
  });

  it("should flag an answer that is just yes or no in either language", () => {
    expect(isYesNoQuestion("Что на самом деле существует?", "Нет, не существует")).toBe(true);
    expect(isYesNoQuestion("What exists?", "No, it does not")).toBe(true);
  });

  it("should allow wh-questions and answers that merely begin with a similar word", () => {
    expect(isYesNoQuestion("Why do tables with many indexes write more slowly?", "Because every write updates each index")).toBe(false);
    expect(isYesNoQuestion("Какой тип базы данных хранит документы?", "Нереляционная база")).toBe(false);
    expect(isYesNoQuestion("Which database family is it?", "No-SQL databases")).toBe(false);
  });
});
