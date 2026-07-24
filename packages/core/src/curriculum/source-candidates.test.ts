import { describe, it, expect } from "vitest";
import { extractSameSiteLinks, dedupeSourceCandidates } from "./source-candidates";

describe("extractSameSiteLinks", () => {
  it("collects same-origin links from anchor tags on the page", () => {
    const html = `
      <nav>
        <a href="/guides/quickstart">Quickstart</a>
        <a href="/guides/advanced">Advanced</a>
        <a href="https://docs.example.com/api">API</a>
      </nav>
    `;

    const links = extractSameSiteLinks(html, "https://docs.example.com", 10);

    expect(links).toEqual([
      "https://docs.example.com/guides/quickstart",
      "https://docs.example.com/guides/advanced",
      "https://docs.example.com/api",
    ]);
  });

  it("excludes links that point at a different origin", () => {
    const html = `
      <a href="/guides/quickstart">Quickstart</a>
      <a href="https://other-site.com/steal-traffic">Off site</a>
    `;

    const links = extractSameSiteLinks(html, "https://docs.example.com", 10);

    expect(links).toEqual(["https://docs.example.com/guides/quickstart"]);
  });

  it("never returns more than the requested cap, regardless of how many links the page has", () => {
    const manyLinks = Array.from({ length: 200 }, (_, i) => `<a href="/page-${i}">Page ${i}</a>`).join(
      "\n",
    );

    const links = extractSameSiteLinks(manyLinks, "https://docs.example.com", 8);

    expect(links).toHaveLength(8);
  });

  it("dedupes repeated links (including a trailing hash difference) on the same page", () => {
    const html = `
      <a href="/guides/quickstart">Quickstart</a>
      <a href="/guides/quickstart#install">Quickstart (install)</a>
      <a href="/guides/quickstart">Quickstart again</a>
    `;

    const links = extractSameSiteLinks(html, "https://docs.example.com", 10);

    expect(links).toEqual(["https://docs.example.com/guides/quickstart"]);
  });

  it("ignores anchors with no usable href (mailto, bare hash, javascript:)", () => {
    const html = `
      <a href="#top">Top</a>
      <a href="mailto:hello@example.com">Email</a>
      <a href="javascript:void(0)">Nothing</a>
      <a href="/real-page">Real</a>
    `;

    const links = extractSameSiteLinks(html, "https://docs.example.com", 10);

    expect(links).toEqual(["https://docs.example.com/real-page"]);
  });

  it("returns nothing when the page has no discoverable links", () => {
    const links = extractSameSiteLinks("<p>No links here.</p>", "https://docs.example.com", 8);

    expect(links).toEqual([]);
  });
});

describe("dedupeSourceCandidates", () => {
  it("keeps only one entry per URL", () => {
    const result = dedupeSourceCandidates([
      { url: "https://docs.example.com/a", title: "A", discoveryTier: "llms_txt" },
      { url: "https://docs.example.com/b", title: "B", discoveryTier: "crawl" },
      { url: "https://docs.example.com/a", title: "A (again)", discoveryTier: "search" },
    ]);

    expect(result).toEqual([
      { url: "https://docs.example.com/a", title: "A", discoveryTier: "llms_txt" },
      { url: "https://docs.example.com/b", title: "B", discoveryTier: "crawl" },
    ]);
  });

  it("lets the earlier-listed tier win when two tiers find the same URL", () => {
    const crawlFirst = dedupeSourceCandidates([
      { url: "https://docs.example.com/a", title: "Found by crawl", discoveryTier: "crawl" },
      { url: "https://docs.example.com/a", title: "Found by search", discoveryTier: "search" },
    ]);

    expect(crawlFirst[0]!.discoveryTier).toBe("crawl");
  });

  it("preserves extra fields on each candidate object through the dedupe", () => {
    interface Extended {
      url: string;
      title: string;
      discoveryTier: string;
      kind: "link" | "llms_txt";
      fetchedText: string | null;
    }

    const result = dedupeSourceCandidates<Extended>([
      { url: "https://docs.example.com/a", title: "A", discoveryTier: "llms_txt", kind: "llms_txt", fetchedText: "content" },
    ]);

    expect(result[0]!.kind).toBe("llms_txt");
    expect(result[0]!.fetchedText).toBe("content");
  });

  it("returns an empty array when given no candidates", () => {
    expect(dedupeSourceCandidates([])).toEqual([]);
  });
});
