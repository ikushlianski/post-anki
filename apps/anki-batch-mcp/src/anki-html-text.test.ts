import { describe, expect, it } from "vitest";
import { decodeEntities, htmlToClozeText, htmlToText } from "./anki-html-text.js";

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
