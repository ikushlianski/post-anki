# @e2e study-technology-doc-url — docs URL + level pre-selects a tier

**Narrative.** From a Subject's page, the owner opens "🔎 Study a
technology," fills in a display name, a documentation URL, and picks the
Medium level, then submits. A curriculum is created with no pasted sources;
research runs against the URL. The target site (a local fixture, never a
real third party) publishes an `llms.txt`, so that becomes the primary
grounding — no search fallback. Once research completes, the curriculum's
Medium-tier module starts with its topics pre-included, while Basic and
Advanced start excluded, matching the shipped all-excluded default for the
tiers the learner didn't ask for.

**Actions:** `studyTechnology` (`features/curriculum/actions`).

**Fixtures:**
- `mockDocsSiteBaseUrl` (`features/curriculum/fixtures/mock-data`) — points
  at `e2e/mock-docs-site/server.ts`, a local HTTP server (wired into
  `playwright.config.ts`'s `webServer` list) that serves a fixture
  `llms.txt` at its origin root and 404s everything else. This keeps the
  doc-link research path from ever fetching a real third-party site.
- `uniqueTechnologyName` — a fresh synthetic name per run.
- `DOC_RESEARCH_STUB_PLAN` (`e2e/mock-openrouter/responses.ts`) — the
  synthesis pass (Pass 2, mocked OpenRouter) returns three modules tagged
  `basic` / `medium` / `advanced`, disambiguated from the pasted-material
  curriculum schema by the presence of a `level` field in its JSON schema.

**Pre-test state:** baseline-only. A subject is created via a direct API
request (not through the UI — subject creation itself is already covered by
`features/subject/tests/add-subject`) so this test can focus on the new
study-technology form.

**Assertions (two layers):**
1. UI — the new curriculum's `curriculum-name` card is visible in the
   subject's list; after navigating to its detail page, the Sources list
   shows a `source-row-llms-txt` entry (not `source-row-web-research`),
   confirming the "site published its own map" provenance is visibly
   distinct from a search-grounded curriculum.
2. Persistence — the curriculum's status reaches `ready`; its `sources`
   table has exactly one `llms_txt`-kind row whose `value` is the original
   `docUrl` (not a fetched sub-path); the Medium-tier module's topics are
   `included = true` while the Basic and Advanced modules' topics are
   `included = false`.

**Reseed strategy:** none between runs; isolation comes from a unique
subject + technology name per run.

**Proof:** `e2e/proof/curriculum/study-technology-doc-url.png`, framed on
the curriculum detail page's Sources section.
