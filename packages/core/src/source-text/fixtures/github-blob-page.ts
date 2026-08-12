// A trimmed-down but structurally faithful stand-in for a GitHub blob page:
// global header, repo nav, file tree sidebar, line-number gutter and
// Raw/Blame controls all sit outside the rendered <article
// class="markdown-body">, plus an inline "copy code" <svg> icon nested
// inside the article itself — the case boilerplate stripping has to catch
// even after region selection has already isolated the article.
export const GITHUB_BLOB_PAGE_FIXTURE = `
<!doctype html>
<html lang="en">
  <head>
    <title>Agentic-Design-Patterns/Chapter_1-Prompt_Chaining.md at main</title>
  </head>
  <body>
    <header class="AppHeader">
      <nav aria-label="Global">
        <a href="/">GitHub</a>
        <a href="/features">Product</a>
        <a href="/pricing">Pricing</a>
      </nav>
    </header>
    <nav aria-label="Repository" class="UnderlineNav">
      <a href="/Mathews-Tom/Agentic-Design-Patterns">Code</a>
      <a href="/Mathews-Tom/Agentic-Design-Patterns/issues">Issues</a>
      <a href="/Mathews-Tom/Agentic-Design-Patterns/pulls">Pull requests</a>
    </nav>
    <div id="repo-content">
      <aside id="file-tree">
        <nav aria-label="File tree">
          <ul>
            <li><a href="01-Part_One">01-Part_One</a></li>
            <li><a href="02-Part_Two">02-Part_Two</a></li>
          </ul>
        </nav>
      </aside>
      <div id="file-view">
        <div id="file-view-toolbar">
          <a href="?plain=1">Raw</a>
          <a href="/blame">Blame</a>
        </div>
        <article class="markdown-body entry-content">
          <button aria-label="Copy code">
            <svg viewBox="0 0 16 16"><path d="M0 0h16v16H0z"></path></svg>
          </button>
          <h1>Chapter 1: Prompt Chaining</h1>
          <p>
            Prompt chaining breaks a complex task into a sequence of smaller
            prompts, where the output of one step becomes the input to the
            next. This lets a model apply focused reasoning at each stage
            instead of attempting the entire task in a single pass.
          </p>
          <pre><code>step1 -&gt; step2 -&gt; step3</code></pre>
        </article>
      </div>
    </div>
    <footer class="footer">
      <nav aria-label="Footer">
        <a href="/about">About</a>
        <a href="/security">Security</a>
      </nav>
      <p>&copy; 2026 GitHub, Inc.</p>
    </footer>
  </body>
</html>
`;

export const GITHUB_BLOB_PAGE_CHROME_STRINGS = [
  "Product",
  "Pricing",
  "Pull requests",
  "01-Part_One",
  "02-Part_Two",
  "Blame",
  "About",
  "Security",
  "GitHub, Inc.",
];
