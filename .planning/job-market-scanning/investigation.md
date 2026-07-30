# Job-market + community-signal data sources — investigation (2026-07-31)

Research only. No account created, no credentials generated, no API called. Follows up on
`.planning/job-market-scanning/blocked.md`, which had only done a lightweight scan; this pass
reads each provider's own docs/pricing pages.

Issue #53 requirement: recurring job/tech-demand data grouped by country — explicitly the US,
Europe generally, and specifically Russia, Belarus, Poland — plus a light Reddit/X cross-check.

## Job-market / tech-demand data providers

| Provider | Cost | Documented country coverage (RU/BY/PL) | Data shape | Sign-up |
|---|---|---|---|---|
| **Adzuna** | Free: ~1,000 calls/month (~33/day). Paid tiers exist but are negotiated, not published. | Self-serve docs and third-party integrations (Adzuna MCP server on GitHub, jobspipe.dev field guide) consistently list **12–18 countries**, always Western/Anglo-heavy: UK, US, Germany, France, Australia, NZ, Canada, India, **Poland**, Brazil, Austria, South Africa (core 12); some sources add Netherlands, Belgium, Italy, Spain, Mexico, Singapore for ~18. **Poland: documented, supported.** **Russia: one source (search-engine summary, not an Adzuna primary page) claims Russia was supported until Oct 2023 and has since been dropped — could not confirm this on an Adzuna-owned page, treat as unverified.** **Belarus: not mentioned in any source found, at any point** — no evidence it was ever covered. | Job search (title, company, location, category, salary min/max with a `salary_is_predicted` flag, post date), plus separate stats endpoints: salary histograms, historical salary trends, vacancy counts by region, top hiring companies. No native "job count by technology" filter — technology signal would have to be extracted by keyword-searching job titles/descriptions yourself. | Self-serve web form at developer.adzuna.com/signup (username/email/password, org name, intended use, traffic volume, primary market, industry). Key issued without sales contact. |
| **TheirStack** | Free trial: 200 API credits + 50 company credits (one-time, per official pricing page). Paid: monthly API-credit subscriptions from $59/mo (1,500 credits) up to $1,500/mo (1,000,000 credits); credits roll over up to 12 months. Each job result costs 1 credit; a technology filter costs 0.5 credits per search. | Marketing copy is inconsistent across their own pages — "195 countries" on the coverage page, "100+ countries" on the API reference page. **Neither page names Russia, Belarus, or Poland specifically anywhere I could find** — coverage is asserted in aggregate, not itemized by country. This is a real gap: the country list would only be knowable by running an actual search post-signup. | Purpose-built for this use case: has a `technology_slug` filter (job postings mentioning a specific technology) and a `GET /v0/catalog/technologies` endpoint listing all trackable technologies, plus company attributes (size, funding, industry). This is the only provider found with native technology-level filtering, which is exactly "job counts by technology." | Self-serve, "Sign up for free" button, instant free-trial credits, no sales contact needed except for the separate bulk "Datasets" product. |
| **Jooble** (partner/API program) | Free API key issued via a short request form; no published rate limit found for the standard partner feed (some third-party scraper products separately cap free plans at "10 items per run," but that's a scraper wrapper, not Jooble's own API). | Jooble states it operates in "69 countries" but no source found enumerates them. **No mention of Russia, Belarus, or Poland found in any source searched** — would need to ask Jooble directly or inspect the API response after key issuance. | Aggregated job listings (title, company, location, source board) pulled from thousands of boards and ATS platforms. No technology-count or salary-analytics layer comparable to Adzuna's stats endpoints. | Self-serve request form at jooble.org/api/about; described as free but requires manual approval of the request (not instant). |
| **Indeed Publisher/Search API** | N/A — **dead end**. Indeed closed its Publisher Program to new applicants in October 2022 and the job-search API has been fully deprecated since 2023; no new keys have been issued since. | N/A | N/A | Not available. Indeed's only live APIs (Job Sync, Apply, Disposition Sync, Sponsored Jobs) are employer/ATS-partner tools gated behind a formal partnership agreement — none exposes a public search-jobs endpoint. |
| **LinkedIn (official API)** | N/A — **dead end for this use case**. No public pricing exists because there is no self-serve tier. | N/A | N/A | Requires an approved LinkedIn Talent Solutions partnership with a Relationship/Business-Development contact and a signed data-restricted agreement. Individual developers and small projects are routinely rejected. Not viable for a personal project. |
| **Coresignal** | 14-day free trial (200 "Collect" + 400 "Search" credits, no card required). Paid from $49/mo (Starter, 250+ Collect / 500 Search credits) up to $1,500/mo (Premium, 50k Collect / 150k Search credits + historical API). Per-record cost ranges ~$0.005–$0.196 depending on plan/record type. | Not found documented anywhere in the sources checked — Coresignal's marketing pages emphasize record volume (448M+ job postings) and field count (85+ fields), not a country breakdown. No RU/BY/PL statement found. | Jobs API, Company API, Employee API — richer B2B enrichment (company firmographics, employee counts) alongside job postings, aimed at sales/recruiting use cases rather than aggregate demand-by-technology reporting. | Self-serve trial signup (no card), scaling to paid self-serve tiers; enterprise-scale "Datasets" product is contract/sales-based. |

**Bottom line on Russia/Belarus specifically:** no provider in this list makes an affirmative, citable claim of Russia or Belarus coverage on their own documentation. The one Russia claim found (Adzuna, "supported until Oct 2023") came from a search-engine-generated summary, not a page I could independently verify, so it should be treated as unconfirmed either way, not as evidence of coverage. This matches the prior blocked.md finding: Western commercial job-data providers have sparse-to-nonexistent published coverage of these two countries as of 2026, consistent with continued sanctions/market-exit dynamics — this is only confirmable for real by creating an account and testing a live query per provider.

## Reddit API (2026)

- **Free tier still exists** for non-commercial/personal/hobby use: ~100 requests/minute via OAuth, no dollar cost, and hobby-scale read volume is described as unlikely to hit that ceiling.
- **Commercial use** costs $0.24 per 1,000 calls with a $12,000/year minimum contract commitment — irrelevant here since this is a personal project.
- **Policy change that matters:** in November 2025, Reddit introduced a "Responsible Builder Policy." Self-service OAuth app registration is now closed — every new app, including free-tier personal ones, requires manual pre-approval via a Developer Support form describing the use case, subreddits targeted, and expected volume. Reddit's stated target turnaround is ~7 days. Apps registered before November 2025 keep working; new ones do not get instant keys anymore.
- Practical effect for this project: still free, but no longer instant — budget a ~1-week approval wait before this can be wired up, and expect to describe the intended scan (which subreddits, what volume) in the application.

Sources: [BBN Times Reddit API pricing guide](https://www.bbntimes.com/technology/complete-guide-to-reddit-api-pricing-and-usage-tiers-in-2026), [Techloy Reddit API pricing 2026](https://www.techloy.com/reddit-api-pricing-in-2026-complete-guide-for-developers-and-businesses/), [Prowlo Reddit API pricing](https://prowlo.com/blog/reddit-api-pricing), [molehill.io — Reddit killed self-service API keys](https://molehill.io/blog/reddit_killed_self-service_api_keys_your_options_for_automated_reddit_integration), [Medium — Reddit API dead for indie devs](https://yuangwei.medium.com/the-reddit-api-is-dead-for-indie-devs-heres-how-to-bypass-it-in-n8n-5acbbe37f79a).

## X / Twitter API (2026)

- **No usable free tier.** The old ~100-reads/month free tier is gone.
- Default model for new developers as of Feb 2026 is **pay-per-use**: $0.005 per post read, $0.010 per user read, $0.015 per post created ($0.20 if it contains a link), capped at 2M reads/month.
- Legacy fixed tiers (Basic $200/mo, Pro $5,000/mo) are closed to new signups and existing subscribers are being migrated to pay-per-use.
- Enterprise access starts around $42,000/month — irrelevant here.
- **Bottom line: there is no low-cost path into X data for a personal project anymore.** Even light polling for a cross-check would need a funded developer account and ongoing per-read billing, however small — this is a real dollar cost, not just a registration step.

Sources: [We Are Founders — X API 2026 pricing](https://www.wearefounders.uk/the-x-api-price-hike-a-blow-to-indie-hackers/), [Postproxy — X API pricing 2026](https://postproxy.dev/blog/x-api-pricing-2026/), [xpoz.ai — Twitter/X API pricing tiers](https://www.xpoz.ai/blog/guides/understanding-twitter-api-pricing-tiers-and-alternatives/).

## Free / keyless partial substitutes (not equivalent, flagged as such)

None of these satisfy the country-grouping requirement — they're worth naming only as bounded, zero-cost supplementary signal:

- **HN Algolia Search API** (`hn.algolia.com/api`) — fully free, no API key, no auth. Full-text search over Hacker News stories/comments, including "Ask HN"/"Show HN"/jobs posts. Good for a lightweight technology-mention cross-check (matches issue #53's "light-touch" instruction for the social/community signal) but has zero country dimension and skews toward an English-speaking, US/Western-tech-industry audience.
- **Stack Overflow Developer Survey** (survey.stackoverflow.co) — free, but it's an annual/point-in-time published report, not a queryable API; the 2025 edition covers technology usage across 314 technologies and 177 countries via aggregate charts, not raw per-country counts you can pull programmatically. Usable as a once-a-year manual reference, not for a recurring automated scan.
- **GitHub Octoverse** — GitHub's own annual report (github.blog) on language/repo trends, with some country-level breakdowns (e.g. India vs. US contributor counts) but GitHub explicitly only publishes country metrics when a country has ≥100 unique contributing developers in the period — meaning smaller markets (plausibly Belarus) may simply not appear in the data at all. Also annual, not a live API.

None of these three provide anything resembling Russia/Belarus/Poland job-demand-by-technology data; they're general developer-population/interest signals at best.

## Recommendation

**Register for Adzuna first**, not TheirStack, for one concrete reason: Adzuna's own documented country list is the only one that names Poland explicitly and is verifiable without paying — the free tier (1,000 calls/month) is enough to test real coverage before committing money. TheirStack's technology-filter feature is a better data shape in principle (native "job count by technology" queries, which Adzuna lacks), but its free trial is capped at 200 one-time credits (not a recurring monthly allowance) and its country coverage claims are vague marketing copy ("195 countries" vs "100+ countries" on two of their own pages) with zero named countries — meaning the Russia/Belarus question can't even be narrowed down without spending trial credits on a live query.

Concretely: sign up for Adzuna's free tier first, run one real query against `jobs/pl/search` (Poland, confirmed supported) and attempt `jobs/ru/search` / any Russia/Belarus equivalent to see whether the API errors out or returns data — that single test (a few of the 1,000 free monthly calls) will convert the biggest open unknown (RU/BY coverage) from "undocumented" to "verified" at zero cost. If Adzuna's coverage turns out to exclude Russia/Belarus (plausible, given no provider researched here claims it), that's the trigger for the scope decision blocked.md already flagged: relax the RU/BY requirement for a first cut, or accept TheirStack's higher cost and inspect its response for those countries next.

For the community cross-check: register a Reddit OAuth app now (free, but budget ~1 week for the new manual approval step) and use HN Algolia (zero setup) as a second, genuinely free signal — skip X entirely unless the project is willing to pay per-read; there is no low-cost tier left there as of 2026.

## Sources consulted

- [Adzuna developer overview](https://developer.adzuna.com/overview), [Adzuna API doc root](https://api.adzuna.com/v1/doc), [Adzuna Search endpoint doc](https://api.adzuna.com/v1/doc/Search.md), [Adzuna signup form](https://developer.adzuna.com/signup)
- [jobspipe.dev — Adzuna API field guide](https://jobspipe.dev/blog/adzuna-api)
- [Adzuna Job Search MCP server (GitHub)](https://github.com/folathecoder/adzuna-job-search-mcp)
- [TheirStack — Our Data](https://theirstack.com/en/our-data), [TheirStack Pricing](https://theirstack.com/en/pricing), [TheirStack API Reference](https://theirstack.com/en/docs/api-reference), [TheirStack job search endpoint](https://theirstack.com/en/docs/api-reference/jobs/search_jobs_v1)
- [Jooble Help Center — REST API docs](https://help.jooble.org/en/support/solutions/articles/60001448238-rest-api-documentation), [Jooble partnership](https://help.jooble.org/en/support/solutions/folders/60000477869)
- [Indeed Partner Docs — Job Sync API](https://docs.indeed.com/job-sync-api/), [api-evangelist Indeed overview](https://github.com/api-evangelist/indeed)
- [connectsafely.ai — LinkedIn API 2026 guide](https://connectsafely.ai/articles/linkedin-api-complete-guide-2026), [Microsoft Learn — LinkedIn Job Posting API overview](https://learn.microsoft.com/en-us/linkedin/talent/job-postings/api/overview?view=li-lts-2026-03)
- [Coresignal review — coldiq.com](https://coldiq.com/tools/coresignal), [Coresignal pricing — prospeo.io](https://prospeo.io/s/coresignal-pricing-reviews-pros-and-cons)
- [BBN Times — Reddit API pricing/tiers 2026](https://www.bbntimes.com/technology/complete-guide-to-reddit-api-pricing-and-usage-tiers-in-2026), [Techloy — Reddit API pricing 2026](https://www.techloy.com/reddit-api-pricing-in-2026-complete-guide-for-developers-and-businesses/), [molehill.io — Reddit self-service keys killed](https://molehill.io/blog/reddit_killed_self-service_api_keys_your_options_for_automated_reddit_integration)
- [We Are Founders — X API pricing 2026](https://www.wearefounders.uk/the-x-api-price-hike-a-blow-to-indie-hackers/), [xpoz.ai — Twitter/X API pricing tiers 2026](https://www.xpoz.ai/blog/guides/understanding-twitter-api-pricing-tiers-and-alternatives/)
- [HN Search powered by Algolia](https://hn.algolia.com/api)
- [2025 Stack Overflow Developer Survey](https://survey.stackoverflow.co/2025/), [Technology section](https://survey.stackoverflow.co/2025/technology)
- [GitHub Octoverse](https://github.blog/news-insights/octoverse/)

## Caveats — what remains unverified

Everything above comes from public documentation and third-party summaries, not from an actual API call (per this task's constraints, no account was created and no authenticated request was made). Specifically unverified:
- Adzuna's Russia support/removal claim (single non-primary source).
- Any provider's actual Belarus coverage — no source, primary or secondary, makes any claim about it either way.
- TheirStack's real per-country breakdown — both its own pages give a country count, not a list.
- Jooble's actual list of the "69 countries" it claims.

These can only become facts by creating a free-tier account and issuing a real query — which is the next human action, not something further web research can resolve.
