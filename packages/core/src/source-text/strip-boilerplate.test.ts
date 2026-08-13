import { describe, expect, it } from "vitest";
import { stripBoilerplate } from "./strip-boilerplate";

describe("stripBoilerplate", () => {
  it("removes a <nav> block and its contents", () => {
    expect(stripBoilerplate("<nav><a href=\"/\">Home</a></nav><p>body</p>")).not.toContain("Home");
  });

  it("removes <header>, <footer>, and <aside> blocks", () => {
    const html = "<header>top</header><p>body</p><aside>side</aside><footer>bottom</footer>";
    const result = stripBoilerplate(html);

    expect(result).not.toContain("top");
    expect(result).not.toContain("side");
    expect(result).not.toContain("bottom");
    expect(result).toContain("<p>body</p>");
  });

  it("removes a <form> block", () => {
    expect(stripBoilerplate('<form><input type="text" /></form><p>body</p>')).not.toContain(
      "input",
    );
  });

  it("removes an <svg> block, including a self-closing one", () => {
    expect(stripBoilerplate("<svg><path d=\"M0 0\"></path></svg><p>body</p>")).not.toContain(
      "path",
    );
    expect(stripBoilerplate('<svg viewBox="0 0 1 1" /><p>body</p>')).toContain("<p>body</p>");
  });

  it("removes a <noscript> block", () => {
    expect(stripBoilerplate("<noscript>enable js</noscript><p>body</p>")).not.toContain(
      "enable js",
    );
  });

  it("removes <script> and <style> blocks", () => {
    const html = "<script>evil()</script><style>.a{}</style><p>body</p>";

    expect(stripBoilerplate(html)).toBe("  <p>body</p>");
  });

  it("removes an HTML comment", () => {
    expect(stripBoilerplate("<!-- TODO remove --><p>body</p>")).toBe(" <p>body</p>");
  });

  it("leaves ordinary markup untouched", () => {
    const html = "<article><h1>Title</h1><p>body</p></article>";

    expect(stripBoilerplate(html)).toBe(html);
  });
});
