# Notion English import (issue #79) — verification result: BLOCKED

Status: blocked on human-provided credentials + source pointer. Not implemented. No mocked
Notion response was built to fake completeness.

## 1. Reuse claim — verified false as stated

PM claim: "the-me-agent already has a working Notion MCP client → reuse that approach."

**Fact** (`the-me-agent/CLAUDE.md`, Inbox router section): "The Notion OAuth/connect layer is
code-complete against the real MCP SDK types but **live-unverified** (needs the user's browser to
authorize)... The fetch-and-parse layer in `notion-mcp-client.ts` (tool names, row/property shape)
is a **best-guess contract** built from docs, not a live connection."

**Fact** (`the-me-agent/packages/core/src/inbox/notion/notion-mcp-client.ts:17-21`): the tool-name
candidates it queries against are explicitly commented "best-effort against Notion's published
docs — the live surface can only be confirmed once OAuth completes."

**Fact**: no token/credential file exists anywhere in this sandbox for either project —
`the-me-agent/data/` has no `notion-oauth.json`, there is no `.env` at `the-me-agent`'s root (only
`.env.example`), and post-anki has zero Notion references outside `.product/GLOSSARY.md`
(confirmed via repo-wide grep). This session's own MCP tool list has no Notion server registered.

So "working" is not accurate on either axis: it has never completed a live OAuth handshake in this
environment, and its parsing logic is unverified against real Notion payloads.

**Likely source of the false claim** (Assumption, reasoning below): the-me-agent has three
distinct Notion-adjacent pieces the PM appears to have conflated:
- `packages/core/src/inbox/notion/*` — the MCP OAuth *read* client referenced above (code-complete,
  live-unverified).
- `packages/core/src/capture/notion-write-client.ts` — a separate REST *write* client keyed off
  `ME_NOTION_INTEGRATION_TOKEN`, used by the Chrome-extension capture server, unrelated to reading
  a database.
- `me mcp serve` — the-me-agent's own **vault** MCP server (read-only tools over its notes/
  folder), which post-anki **already does** consume for real, per issues #76/#77. This is a real,
  working, cross-repo MCP integration — just not with Notion. It's likely what made "post-anki
  already talks to the-me-agent via MCP, so Notion reuse should be easy" sound credible.

**Reusability, precisely**: even setting live-verification aside, the Notion client is not a
shared package. the-me-agent uses pnpm workspaces (`@the-me-agent/core`); post-anki uses plain npm
(`package-lock.json`). The Notion client is entangled with sibling internal modules
(`oauth-provider.ts`, `oauth-store.ts`, `loopback-server.ts`, `notion-item.ts`) inside
`packages/core`, not published or exposed as an MCP server the way the vault reader is. Consuming
it cross-repo would mean either publishing it or vendoring/reimplementing the pattern in post-anki.

**Verdict: this is "look at this for inspiration on the pattern," not "reuse."** And the pattern
itself is unproven — the tool-name guesses may not even match Notion's real MCP surface.

## 2. Credential/access blocker — two independent gaps, not one

**Gap A — no Notion credential in this sandbox.** Two possible paths exist in the-me-agent's own
setup, neither present here:
- OAuth MCP path (`ME_NOTION_TOKEN_PATH`): requires a one-time interactive browser authorization
  (`connectNotionMcpClient` opens a URL and runs a local loopback server to catch the redirect —
  Fact, read directly from `notion-mcp-client.ts:45-100`). This cannot be completed non-interactively
  by an agent in this session.
- Internal-integration-token path (`ME_NOTION_INTEGRATION_TOKEN`): a plain secret, created by a
  human in Notion's own integrations settings and then explicitly shared with the target
  page/database inside Notion's UI (**Assumption** — standard Notion integration behavior recalled
  from general knowledge, not re-verified against current Notion docs for this write-up; verify via
  `docs-proof` before relying on it if this path is chosen).

Either path requires a one-time human action; there is no way to obtain or fabricate this
credential autonomously.

**Gap B — no source pointed at, independent of the credential.** The issue body itself says: "Which
Notion database/page is the actual source (needs Ilya to point at it or share the URL)." Even with
a valid token in hand, there is nothing to query yet — `ME_NOTION_INBOX_URL` in the-me-agent is that
project's *inbox* database, not an English-vocabulary list, so it isn't a substitute source.
Handing over a token alone does not unblock this; the source URL/database must also be supplied.

**Conclusion: genuine human-only blocker on two fronts.** Per instructions, no implementation was
attempted and no mocked/fake Notion response was used to simulate completion.

## 3. What's already verified as NOT blocked (so the follow-up build isn't starting from zero)

**Fact**: post-anki's schema (`apps/api/src/db/schema.ts`) already has `subjects`, curricula,
modules, and topics tables (`subjects` pgTable, `curriculumDomainNodeMappings`,
`curriculumStructureTurns`, etc. — read directly). The PM's "no schema changes" claim holds:
an "English" Subject with a new Curriculum underneath is an existing, already-supported shape per
`.product/GLOSSARY.md`'s Subject → Curriculum → Module → Topic hierarchy — no new tables or
migrations needed to hold the imported content once it exists.

This confirms the destination side of the pipeline is ready. Only the source side (Notion access)
is blocked.

## 4. What unblocks this, concretely

To hand back to Ilya:
1. **Pick and provide one Notion credential path**: either complete the-me-agent-style OAuth once
   interactively (needs a human at a browser) and share the resulting token file's location, or
   create a Notion internal integration token and share it as `ME_NOTION_INTEGRATION_TOKEN`-style
   env value for post-anki, plus (per the Notion-sharing assumption above) explicitly share the
   target database with that integration inside Notion.
2. **Point at the actual source**: the URL or ID of the specific Notion database/page holding the
   English phrases/words (the issue's own open question — not something derivable from the
   codebase).

Once both are in hand, re-run this verification pass: confirm the Notion MCP tool-name guesses in
`notion-mcp-client.ts` against a real `notion:smoke`-style call (they're explicitly unverified),
then write the concrete data-flow plan (Notion fetch → parse → post-anki Subject/Curriculum/Topic
records) against post-anki's real `domain-map`/`lecture`/curriculum creation code paths, with tests
that mock the Notion call rather than hit it live.
