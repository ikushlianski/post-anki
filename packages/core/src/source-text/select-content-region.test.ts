import { describe, expect, it } from "vitest";
import { selectContentRegion } from "./select-content-region";

describe("selectContentRegion", () => {
  it("returns only the content inside <main> when it is present", () => {
    const html = "<nav>menu</nav><main><p>the article</p></main><footer>bye</footer>";

    expect(selectContentRegion(html)).toBe("<p>the article</p>");
  });

  it("falls back to <article> when there is no <main>", () => {
    const html = "<header>chrome</header><article><p>the article</p></article>";

    expect(selectContentRegion(html)).toBe("<p>the article</p>");
  });

  it("prefers <main> over <article> when both are present", () => {
    const html = "<main><article><p>inner</p></article></main>";

    expect(selectContentRegion(html)).toBe("<article><p>inner</p></article>");
  });

  it("returns the whole document when neither <main> nor <article> is present", () => {
    const html = "<div><p>just a plain page</p></div>";

    expect(selectContentRegion(html)).toBe(html);
  });

  it("matches a <main> tag that carries attributes", () => {
    const html = '<main id="main-content" class="content"><p>text</p></main>';

    expect(selectContentRegion(html)).toBe("<p>text</p>");
  });
});
