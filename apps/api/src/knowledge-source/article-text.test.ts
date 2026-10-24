import { describe, expect, it } from "vitest";
import { extractArticleText } from "./article-text.js";

describe("extractArticleText", () => {
  it("should keep the article body and drop menus, footer and comments", () => {
    const html = `<body><nav>Home About Pricing</nav><header>Site banner</header>
      <article><h1>Title</h1><p>Real body text.</p><div class="comments">Great post lol</div></article>
      <aside>Related stories</aside><footer>Copyright</footer></body>`;
    const text = extractArticleText(html);

    expect(text).toContain("Real body text.");
    expect(text).not.toMatch(/Home About|Site banner|Great post|Related stories|Copyright/);
  });

  it("should prefer itemprop articleBody over the surrounding main element", () => {
    const html = `<main><p>Newsletter signup pitch</p><div itemprop="articleBody"><p>The story.</p></div></main>`;
    const text = extractArticleText(html);

    expect(text).toContain("The story.");
    expect(text).not.toContain("Newsletter signup pitch");
  });

  it("should use main when there is no article element", () => {
    const text = extractArticleText(`<nav>Menu</nav><main><p>Main content</p></main><footer>Foot</footer>`);

    expect(text).toBe("Main content");
  });

  it("should strip boilerplate and keep the rest when no article container exists", () => {
    const html = `<body><nav>Menu</nav><div class="cookie-banner">Accept cookies</div>
      <div class="share-buttons">Share</div><p>Plain page text.</p><footer>Foot</footer></body>`;
    const text = extractArticleText(html);

    expect(text).toContain("Plain page text.");
    expect(text).not.toMatch(/Menu|Accept cookies|Share|Foot/);
  });

  it("should drop hidden and script content", () => {
    const text = extractArticleText(`<p>Visible</p><script>evil()</script><div hidden>secret</div>`);

    expect(text).toBe("Visible");
  });
});
