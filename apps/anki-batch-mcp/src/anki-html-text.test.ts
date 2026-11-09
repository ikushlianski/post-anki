import { describe, expect, it } from "vitest";
import { decodeEntities, htmlToClozeText, htmlToText, unwrapClozeGaps } from "./anki-html-text.js";

describe("htmlToText", () => {
  it("should decode hex, nbsp and angle-bracket entities exactly once", () => {
    expect(htmlToText("a&#x20;b&nbsp;c &lt;x&gt;")).toBe("a b c <x>");
    expect(decodeEntities("&amp;lt;")).toBe("&lt;");
  });

  it("should turn line breaks and the end of a block into newlines", () => {
    expect(htmlToText("one<br>two<div>three</div><p>four</p>")).toBe("one\ntwothree\nfour");
  });

  it("should drop scripts and images so only prose reaches the pipeline", () => {
    expect(htmlToText('hi<script>alert(1)</script><img src="a.png">there')).toBe("hithere");
  });

  it("should restore a cloze with a placeholder to the full sentence", () => {
    const html = 'Ответ: <span class="cloze" data-cloze="ключ&#x20;успеха" data-ordinal="1">[...]</span>.';

    expect(htmlToText(html)).toBe("Ответ: ключ успеха.");
  });

  it("should restore a cloze that shows a hint", () => {
    const html = '<span class="cloze" data-cloze="медленно" data-ordinal="1">[подсказка]</span> нанимать';

    expect(htmlToText(html)).toBe("медленно нанимать");
  });

  it("should unwrap nested inactive cloze spans", () => {
    const html = '<span class="cloze-inactive"><span class="cloze-inactive">текст</span></span> тут';

    expect(htmlToText(html)).toBe("текст тут");
  });

  it("should restore a cloze whose hint holds a closing div", () => {
    const html = 'до <span class="cloze" data-cloze="ответ" data-ordinal="1">[a</div>b]</span> после';

    expect(htmlToText(html)).toBe("до ответ после");
  });
});

describe("htmlToClozeText", () => {
  it("should emit the ordinal and the hint of each gap", () => {
    const html =
      'A <span class="cloze" data-cloze="x" data-ordinal="2">[подсказка]</span> B <span class="cloze" data-cloze="y" data-ordinal="3">[...]</span>';

    expect(htmlToClozeText(html)).toBe("A {{c2::x::подсказка}} B {{c3::y}}");
  });

  it("should ignore the [...] placeholder and default the ordinal to 1", () => {
    expect(htmlToClozeText('<span class="cloze" data-cloze="ответ">[...]</span>')).toBe("{{c1::ответ}}");
    expect(htmlToClozeText('<span data-cloze="a" data-ordinal="1">[\u2026]</span>')).toBe("{{c1::a}}");
  });

  it("should fall back to the plain answer when it contains :: or }}", () => {
    expect(htmlToClozeText('x <span data-cloze="a::b" data-ordinal="1">[...]</span>')).toBe("x a::b");
    expect(htmlToClozeText('x <span data-cloze="a}}b" data-ordinal="1">[...]</span>')).toBe("x a}}b");
    expect(htmlToClozeText('x <span data-cloze="a" data-ordinal="1">[h::i]</span>')).toBe("x a");
  });

  it("should leave text without gaps equal to htmlToText", () => {
    expect(htmlToClozeText("one<br>{{c1::two}}")).toBe("one\n{{c1::two}}");
  });
});

describe("decodeEntities safety", () => {
  it("should drop impossible, control and surrogate code points instead of throwing", () => {
    expect(decodeEntities("a&#99999999999;b&#0;c&#x1b;d&#xD800;e&#x110000;f")).toBe("abcdef");
  });

  it("should keep tabs, newlines and ordinary characters", () => {
    expect(decodeEntities("a&#9;b&#10;c&#233;")).toBe("a\tb\ncé");
  });
});

describe("hostile input stays fast", () => {
  const SIZE = 200_000;
  const timed = (run: () => unknown) => {
    const start = performance.now();

    run();

    return performance.now() - start;
  };

  it.each([
    ["repeated cloze openers with no closer", "{{c1::".repeat(SIZE / 6)],
    ["a run of angle brackets", "<".repeat(SIZE)],
    ["a run of escaped angle brackets", "&lt;".repeat(SIZE / 4)],
    ["repeated unclosed script tags", "<script>".repeat(SIZE / 8)],
    ["repeated unclosed cloze spans", '<span data-cloze="a">'.repeat(SIZE / 22)],
    ["repeated unclosed deck labels", '<div class="subdeck-label">'.repeat(SIZE / 27)],
    ["repeated image openers", "<img ".repeat(SIZE / 5)],
  ])("should convert %s in well under half a second", (_label, input) => {
    expect(timed(() => htmlToText(input))).toBeLessThan(500);
    expect(timed(() => htmlToClozeText(input))).toBeLessThan(500);
    expect(timed(() => unwrapClozeGaps(input))).toBeLessThan(500);
  });

  it("should still unwrap a closed cloze gap and drop its hint", () => {
    expect(unwrapClozeGaps("a {{c1::b::hint}} c {{c2::d}} {{c3::open")).toBe("a b c d {{c3::open");
  });
});
