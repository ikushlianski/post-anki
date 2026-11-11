// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { readSelectionMarkdown } from "./read-selection-markdown.js";

function selectAll(html: string): void {
  document.body.innerHTML = `<div id="root">${html}</div>`;

  const range = document.createRange();

  range.selectNodeContents(document.getElementById("root") as HTMLElement);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

function selectInside(selector: string): void {
  const range = document.createRange();

  range.selectNodeContents(document.querySelector(selector) as HTMLElement);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("readSelectionMarkdown", () => {
  it("should keep indentation of captured code", () => {
    selectAll('<pre><code>def f(x):\n    if x:\n        return 1\n\treturn 2</code></pre>');

    expect(readSelectionMarkdown()).toBe("```\ndef f(x):\n    if x:\n        return 1\n\treturn 2\n```");
  });

  it("should tag the fence with the language named by the page", () => {
    selectAll('<pre><code class="language-ts">const a = 1;</code></pre>');
    expect(readSelectionMarkdown()).toBe("```ts\nconst a = 1;\n```");

    selectAll('<pre class="lang-py"><code>x = 1</code></pre>');
    expect(readSelectionMarkdown()).toBe("```py\nx = 1\n```");

    selectAll('<pre><code class="hljs rust">let x = 1;</code></pre>');
    expect(readSelectionMarkdown()).toBe("```rust\nlet x = 1;\n```");
  });

  it("should keep prose around code and blank lines inside code", () => {
    selectAll("<p>Run this:</p><pre><code>a\n\n\n  b</code></pre><p>Then   wait.</p>");

    expect(readSelectionMarkdown()).toBe("Run this:\n\n```\na\n\n\n  b\n```\n\nThen wait.");
  });

  it("should capture a selection made entirely inside a code block", () => {
    selectAll('<pre><code class="language-js">one\n  two</code></pre>');
    selectInside("code");

    expect(readSelectionMarkdown()).toBe("```js\none\n  two\n```");
  });

  it("should turn inline code into backticks and not fence it", () => {
    selectAll("<p>Use <code>map()</code> here</p>");

    expect(readSelectionMarkdown()).toBe("Use `map()` here");
  });

  it("should use a longer fence when the code contains backticks", () => {
    selectAll("<pre><code>```\nx\n```</code></pre>");

    expect(readSelectionMarkdown()).toBe("````\n```\nx\n```\n````");
  });

  it("should leave prose-only selections to the plain selection text", () => {
    selectAll("<p>Just words</p>");

    expect(readSelectionMarkdown()).toBeNull();
  });
});

describe("readSelectionMarkdown line divs", () => {
  it("should not add blank lines between line divs separated by newline text", () => {
    selectAll("<pre><div>a = 1</div>\n<div>b = 2</div></pre>");

    expect(readSelectionMarkdown()).toBe("```\na = 1\nb = 2\n```");
  });
});
