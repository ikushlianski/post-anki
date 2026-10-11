# Model switcher research for knowledge extraction (2026-10-11)

Scope: Russian and English, no Chinese-vendor models, structured output required. Prices from the OpenRouter API on 2026-10-11, per 1M tokens (input / output).

## Sources and trust (low)

- Public OpenRouter usage rankings for early October 2026 are led by Chinese models and one stealth model, which are excluded here. They say little about our candidates and the sources disagree on numbers: https://tokenmaxxing.com/openrouter-rankings , https://www.teamday.ai/blog/top-ai-models-openrouter-2026 , https://presenc.ai/research/openrouter-model-usage-rankings-2026
- A July snapshot put Gemini 2.5 Flash Lite and 3.1 Flash Lite around rank 19-20 by weekly tokens (presenc.ai above): heavily used, not necessarily best.
- Structured-output research is English-only. Structured Output Benchmark: model size does not predict quality; errors inside valid JSON are the hardest to find: https://arxiv.org/html/2604.25359v1 . Constrained decoding paper: very small models often break the schema, large ones almost never: https://arxiv.org/html/2609.23742v1
- No Russian extraction benchmark found; quality statements below come only from our own runs.

## Our measurements

Russian sales text (752 chars), 4-5 runs per model: valid items out of 4-8 returned. English long text (4042 chars), 3 runs: the pipeline caps output at 8 items, so it shows reliability, not completeness.

| Model | Russian valid | Cost (ru) | English valid of 8 | Cost (en) |
|---|---|---|---|---|
| openai/gpt-5-mini | 5-8 | $0.0090 | 8, 8, 8 | $0.0108 |
| openai/gpt-6-luna | 5-7 | $0.0010 | 7, 8, 8 | $0.0015 |
| anthropic/claude-haiku-5.5 | 3-5 | $0.0011 | 7, 8, 8 | $0.0016 |
| openai/gpt-oss-120b | 4-5 | $0.0007 | 7, 8, one timeout | $0.0008 |
| mistralai/mistral-small-3.2-24b-instruct | 3-6 | $0.00027 | 5, 8, 8 | $0.00036 |
| meta-llama/llama-3.3-70b-instruct | 3-5 | $0.00038 | 8, 8, 8 | $0.00076 |
| google/gemma-4-31b-it | 2-4 | $0.00024 | 7, 8, 8 | $0.00049 |
| google/gemini-2.5-flash-lite | 2-5 | $0.0004 | 8, 8, 8 | $0.00052 |
| openai/gpt-4.1-nano | 3-5 | $0.00024 | 3, 6, 8 | $0.00038 |
| openai/gpt-4o-mini | 2-4 | $0.0004 | not run | - |
| google/gemini-3.1-flash-lite | 2-3 | $0.0010 | 7, 8, 8 | $0.0018 |
| openai/gpt-5-nano | 3-4 | $0.0049 | not run | - |

Failed re-checks, not included: mistralai/mistral-small-2603 (429 on all runs), nvidia/nemotron-3-super-120b-a12b (timeouts and 429). Run-to-run spread is large for every model.

## Recommended top 10 for the switcher

| # | Model id | Price in / out | Why | Risk |
|---|---|---|---|---|
| 1 | openai/gpt-6-luna | $0.10 / $0.50 | Best Russian coverage among cheap models, clean English, 1M context | New name, no independent reviews found, behavior may change between versions |
| 2 | anthropic/claude-haiku-5.5 | $0.10 / $0.50 | Most precise wording, reliable schema | Fewer Russian items (3-5), a few "according to the text" phrasings |
| 3 | google/gemma-4-31b-it | $0.09 / $0.34 | Cheapest reliable, open weights, many providers | Russian 2-4, some cards dropped |
| 4 | openai/gpt-oss-120b | $0.037 / $0.17 | Cheapest input, 4-5 on Russian | One English timeout, provider-dependent quality |
| 5 | mistralai/mistral-small-3.2-24b-instruct | $0.094 / $0.25 | European vendor, cheap, 3-6 on Russian | One weak English run (5 of 8) |
| 6 | meta-llama/llama-3.3-70b-instruct | $0.22 / $0.50 | Perfect English (8, 8, 8), 3-5 Russian, mature | Old, price varies by provider |
| 7 | openai/gpt-5-mini | $0.25 / $2.00 | Maximum coverage in both languages | About 8x Luna per text |
| 8 | google/gemini-3.1-flash-lite | $0.25 / $1.50 | Reliable English, current stable Flash Lite | Weak Russian coverage (2-3) |
| 9 | openai/gpt-4o-mini | $0.15 / $0.60 | Widely used, stable | Weaker on Russian (2-4) |
| 10 | openai/gpt-4.1-nano | $0.10 / $0.40 | Very cheap, 3-5 on Russian | Unstable English (3, 6, 8): budget option only |

Deliberately left out: google/gemini-2.5-flash-lite ($0.10 / $0.40; good results but OpenRouter lists an expiration of 2026-10-20: keep until that date, then remove), Gemini 3.5 Flash Lite and 3 Flash preview (dearer, fewer valid Russian items), gpt-5-nano (about $0.005 per text for 3-4 valid), all Chinese vendors.

Suggested default: openai/gpt-6-luna. If its novelty is a concern, keep anthropic/claude-haiku-5.5.

To verify: run ru-messy.txt and en-indexes.txt before choosing the default; rerun `npm run models:prices` before release.

END-OF-REPORT
