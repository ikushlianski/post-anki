import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "./decode-html-entities";

describe("decodeHtmlEntities", () => {
  it("decodes a decimal numeric entity, like a curly apostrophe", () => {
    expect(decodeHtmlEntities("the user&#8217;s data")).toBe("the user’s data");
  });

  it("decodes a hex numeric entity", () => {
    expect(decodeHtmlEntities("the user&#x2019;s data")).toBe("the user’s data");
  });

  it("decodes the standard escape entities to their characters", () => {
    expect(decodeHtmlEntities("Tom&amp;Jerry")).toBe("Tom&Jerry");
    expect(decodeHtmlEntities("a &lt;b&gt; tag")).toBe("a <b> tag");
    expect(decodeHtmlEntities("say &quot;hi&quot;")).toBe('say "hi"');
    expect(decodeHtmlEntities("a&nbsp;b")).toBe("a b");
  });

  it("decodes &#39; as an apostrophe via the numeric path", () => {
    expect(decodeHtmlEntities("it&#39;s fine")).toBe("it's fine");
  });

  it("decodes common named punctuation entities", () => {
    expect(decodeHtmlEntities("done&hellip; &mdash; really")).toBe("done… — really");
  });

  it("leaves an unrecognized entity as literal text instead of deleting it", () => {
    expect(decodeHtmlEntities("a &foo; b")).toBe("a &foo; b");
  });

  it("leaves plain text with no entities untouched", () => {
    expect(decodeHtmlEntities("no entities here")).toBe("no entities here");
  });
});
