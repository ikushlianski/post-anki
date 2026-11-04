import { describe, expect, it } from "vitest";
import { buildPhraseKey, parsePhraseLines } from "./parse-phrase-lines.js";

function first(line: string) {
  return parsePhraseLines([line]).phrases[0];
}

describe("parsePhraseLines", () => {
  it("should strip bullets, numbering, checkboxes and bold so only the phrase is kept", () => {
    expect(first("- **touch base**")?.phrase).toBe("touch base");
    expect(first("3. let's circle back")?.phrase).toBe("let's circle back");
    expect(first("- [ ] `take it offline`")?.phrase).toBe("take it offline");
    expect(first("* _loop you in_")?.phrase).toBe("loop you in");
  });

  it("should move a trailing parenthesis into the hint", () => {
    expect(first("click on the link (not click on..)")).toMatchObject({
      phrase: "click on the link",
      hint: "not click on..",
    });
  });

  it("should move an equals tail into the hint", () => {
    expect(first("got sidetracked = was sidetracked")).toMatchObject({
      phrase: "got sidetracked",
      hint: "was sidetracked",
    });
  });

  it("should move a Russian gloss into the hint", () => {
    expect(first("touch base - выйти на связь")).toMatchObject({
      phrase: "touch base",
      hint: "выйти на связь",
    });
  });

  it("should mark a phrase with ??? as unsure and remove the marks", () => {
    expect(first("wrap it up???")).toMatchObject({ phrase: "wrap it up", unsure: true });
    expect(first("wrap it up")?.unsure).toBe(false);
  });

  it("should ignore blank and Cyrillic-only lines and count them", () => {
    const result = parsePhraseLines(["", "   ", "привет всем", "touch base"]);

    expect(result.phrases).toHaveLength(1);
    expect(result.ignored).toBe(3);
  });

  it("should drop repeats inside the input, keep the first and count them", () => {
    const result = parsePhraseLines(["Touch base", "touch base!", "- touch  base (hint)"]);

    expect(result.phrases).toHaveLength(1);
    expect(result.phrases[0]?.phrase).toBe("Touch base");
    expect(result.duplicatesInInput).toBe(2);
  });

  it("should keep the unsure marker and the hint when a repeat of the phrase carries them", () => {
    const result = parsePhraseLines(["wrap it up", "wrap it up ??? - завершить"]);

    expect(result.phrases).toHaveLength(1);
    expect(result.phrases[0]?.unsure).toBe(true);
    expect(result.phrases[0]?.hint).toBe("завершить");
    expect(result.duplicatesInInput).toBe(1);
  });

  it("should give the same key regardless of case and punctuation", () => {
    expect(buildPhraseKey("Touch base!")).toBe("phrase:touch base");
    expect(buildPhraseKey("  TOUCH,   base ")).toBe(buildPhraseKey("touch base"));
  });
});

describe("parsePhraseLines unsure markers", () => {
  it("should mark ???, ?!?? and (?) as unsure without leaving them in the phrase or hint", () => {
    expect(first("wrap it up ???")).toMatchObject({ phrase: "wrap it up", hint: null, unsure: true });
    expect(first("wrap it up ?!??")).toMatchObject({ phrase: "wrap it up", hint: null, unsure: true });
    expect(first("wrap it up (?)")).toMatchObject({ phrase: "wrap it up", hint: null, unsure: true });
  });
});
