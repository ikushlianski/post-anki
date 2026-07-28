# Job market + community trend scanning (#53) — blocked at planning

Not planned. No spec.md, no plan-playwright pass. This is a genuine human-only blocker, exactly
as the wishlist entry and issue #53 predicted when they deliberately placed this item last in
the queue.

## What's missing

Every candidate data source for country-grouped job-market demand (Adzuna, TheirStack, and
similar) requires a human to register an account and generate an API key. That registration
step cannot be performed by this session — there is no account, no email verification, no
accepting of a provider's terms available here. Same for the Reddit/X cross-check: Reddit's API
requires an OAuth app credential (client id/secret) tied to a registered Reddit account, and X's
API has no free read tier at all as of 2026 — reading posts is pay-per-use ($5/1,000 reads).
None of this is something an agent can self-provision; a human has to decide which paid or
registered service to use and go create the credential.

**Verified, not assumed** — checked before concluding, not guessed:
- `.env` files in this worktree are template-only (`.env.example`); no real `.env` exists here.
- Read-only check of the main checkout's real `.env` files (`/Users/ikushlianski/webdata/ilya-projects/post-anki/.env`, `apps/api/.env`, `apps/api/.env.local`, `apps/web/.env`, `e2e/.env`) found no job-market or Reddit/X/social key of any kind.
- `gh secret list` on the repo shows nine configured secrets — Telegram, OpenRouter, database, Langfuse, Pulumi, API shared secret. None is job-market or social-media related.

## Why there's no free/keyless workaround either

There are genuinely keyless job-listing APIs (Remotive, Arbeitnow, HN Algolia's "Who's Hiring"
search) but none of them satisfy issue #53's actual requirement: demand data grouped by country,
specifically including Russia, Belarus, and Poland alongside the US and rest of Europe. These
free feeds are remote-job or US-skewed listings, not per-country technology-demand breakdowns,
and none has Belarus-level country granularity. Adzuna's free tier (1,000 calls/month) is the
most plausible eventual fit for the "grouped by country" requirement, but even that is
**unverified** whether its country coverage includes Russia/Belarus at all — that's exactly the
kind of check that requires actually creating the account and reading the coverage list, not
something inferable from outside.

## What was explicitly rejected as a shortcut, and why

Using an LLM web-search call (this project already has `OPENROUTER_API_KEY` and a working
grounded-search pattern in `tech-research-grounding.ts`, and item 7's review orchestrator already
makes a general-purpose AI call) to ask a model "what's trending in Poland/Russia/Belarus right
now" was considered and rejected. A model's impression of the job market is not job-market data —
it's ungrounded, unverifiable, and would silently violate this project's own trusted-sources bar
(the same bar enforced for lecture-mode and doc-scan grounding: real cited sources, never
auto-trusted model output). Fabricating a data source this way would be exactly the kind of
shortcut CLAUDE.md and this run's own precedent (doc-changelog-scan's refusal to fake a
production Pulumi deploy) forbid.

## Decisions a human needs to make before this can be planned for real

1. **Which job-market data provider to register for**, and whether its free tier is acceptable
   or a paid tier is worth it. Adzuna is the most plausible starting point (documented, free tier,
   multi-country) but its actual coverage of Russia/Belarus/Poland needs to be checked by someone
   with an account, not assumed.
2. **Whether the Russia/Belarus requirement can be relaxed** if no affordable provider covers
   those two countries at the granularity issue #53 asks for (most commercial job-data APIs have
   sparse or no coverage there) — that's a scope decision, not something to quietly drop.
3. **Whether the Reddit/X cross-check is worth paying for or registering for at all**, given
   issue #53's own instruction to keep it "light-touch" — it may be more consistent with that
   instruction to defer or drop the social cross-check for a first cut and ship country-grouped
   job-market data alone, once a provider is chosen.
4. Once an account and API key exist for the chosen provider(s), add the key(s) to
   `apps/api/.env.local` / the `PROD_*` GitHub Secrets set (following the existing pattern next to
   `OPENROUTER_API_KEY`), and this item can go through `/plan-playwright` for real — reusing item
   7's `domain_priority_suggestions.source` column exactly as the wishlist anticipated.

## What is not blocked, for clarity

The consumption side is entirely ready and needs no rework: `domain_priority_suggestions` already
has the `source` discriminator column reserved for this scan (`apps/api/src/domain-map/domain-priority-review.orchestrator.ts`),
and the review screen this would feed into is already built and merged (item 7). The blocker is
solely the data source decision — there is nothing to design or build until a human picks and
registers for a provider.
