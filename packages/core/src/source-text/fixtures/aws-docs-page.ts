// A trimmed-down but structurally faithful stand-in for an AWS Prescriptive
// Guidance docs page: a huge left-nav tree, breadcrumbs, a cookie banner and
// a footer all sit outside <main>, plus an in-page table-of-contents <nav>
// nested inside <main> itself — the case that region selection alone cannot
// clean up and boilerplate stripping has to handle too.
export const AWS_DOCS_PAGE_FIXTURE = `
<!doctype html>
<html lang="en">
  <head>
    <title>Introduction - Agentic AI security</title>
    <style>.awsui-app-layout { display: flex; }</style>
  </head>
  <body>
    <header id="awsc-top-nav">
      <a href="/">AWS</a>
      <nav aria-label="Global">
        <a href="/console">Console</a>
        <a href="/docs">Documentation</a>
      </nav>
    </header>
    <div id="awsccc-cb-content">
      <p>We use cookies to improve your experience.</p>
      <button>Accept all cookies</button>
      <button>Customize cookie preferences</button>
    </div>
    <nav aria-label="Breadcrumbs">
      <a href="/prescriptive-guidance">Prescriptive guidance</a>
      &gt;
      <a href="/prescriptive-guidance/agentic-ai-security">Agentic AI security</a>
      &gt;
      <span>Introduction</span>
    </nav>
    <nav id="left-nav" aria-label="Table of contents">
      <ul>
        <li><a href="#introduction">Introduction</a></li>
        <li><a href="#threat-model">Threat model for agentic workloads</a></li>
        <li><a href="#identity">Identity and access boundaries</a></li>
        <li><a href="#guardrails">Guardrails and tool scoping</a></li>
        <li><a href="#references">References</a></li>
      </ul>
    </nav>
    <main id="main-content">
      <nav aria-label="On this page">
        <ul>
          <li><a href="#overview">Overview</a></li>
          <li><a href="#scope">Scope</a></li>
        </ul>
      </nav>
      <article>
        <h1>Introduction</h1>
        <p>
          Agentic AI workloads combine large language models with tool
          execution, retrieval, and multi-step planning. This guidance
          describes a defense-in-depth approach for securing agentic systems
          on AWS, covering identity boundaries, tool scoping, and monitoring.
        </p>
        <h2>Why agentic workloads need a distinct security model</h2>
        <p>
          An agent that can call tools and take actions on a user&#8217;s
          behalf introduces a different threat surface than a stateless
          chatbot &mdash; prompt injection from retrieved content can steer
          tool calls the same way a compromised dependency can steer code.
        </p>
      </article>
    </main>
    <footer id="awsc-footer">
      <nav aria-label="Footer">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Site terms</a>
      </nav>
      <p>&copy; 2026, Amazon Web Services, Inc. or its affiliates. All rights reserved.</p>
    </footer>
  </body>
</html>
`;

export const AWS_DOCS_PAGE_CHROME_STRINGS = [
  "Accept all cookies",
  "Customize cookie preferences",
  "Prescriptive guidance",
  "Console",
  "Threat model for agentic workloads",
  "Identity and access boundaries",
  "Guardrails and tool scoping",
  "Overview",
  "Scope",
  "Privacy",
  "Site terms",
  "Amazon Web Services, Inc.",
];
