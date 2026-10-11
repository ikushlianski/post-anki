# Model benchmark for source-first generation

VERDICT 1. Offer these 5 choices, best quality per price first: google/gemini-2.5-flash-lite, google/gemma-4-31b-it, mistralai/mistral-small-24b-instruct-2501, google/gemma-3-12b-it, anthropic/claude-haiku-5.5 (premium tier).
VERDICT 2. Default: google/gemini-2.5-flash-lite. It was the best Russian output among cheap models: faithful, no meta words, 100% verified quotes, about 0.8 s median, $0.10 in / $0.40 out per million tokens.
VERDICT 3. Cost at 100 pastes a day, 30 days, default: about $2.40 a month (assumes about 2,000 input and 1,500 output tokens per paste). Measured on my short test texts (about 400 in, 1,000 out) it was $0.00045 per paste, which is about $1.35 a month.
VERDICT 4. Reject: granite-4.2-8b (answered the Russian text in English), gpt-4.1-nano (3 items, one nonsense answer, copied the injection line into a quote), gpt-4o-mini (weak Russian items, only 71% quotes verify), gpt-5-nano (about 5x the cost from hidden reasoning tokens, copies the source), gpt-oss-120b (60 s timeout, 11 s on another run), nemotron-3-nano and ministral-14b (shallow or invented content).
VERDICT 5. llama-4-scout is unrated: 3 of 4 runs failed (two upstream 429, one 60 s timeout). mistral-small-3.2 is a near-duplicate of the 2501 variant and invented one claim in Russian, so it is not offered.

## Setup (Facts, from the run)
- Script: /Users/ikushlianski/webdata/ilya-projects/post-anki/scripts/model-bench.mjs. Raw outputs and results.json were written outside the repo (session scratchpad).
- 14 models x 4 texts (Russian from the user, English about 200 words, Spanish about 120 words, injection paragraph), one run each, 60 s timeout, 4 in flight, strict json_schema, exact system prompt from the task.
- Candidates were filtered from the live OpenRouter list: structured_outputs supported, no Chinese vendors, no :free or :batch, at most $0.30 in and $0.60 out. I added anthropic/claude-haiku-5.5 (listed at $0.10/$0.50) as a quality reference; it is not on the favoured-vendor list.
- Cost comes from the usage block (usage.cost) where present. Latency is wall-clock per request.

## Results table
Check columns count runs out of 4 texts. Quote and standalone are item-level shares over all runs. Meta = runs with no meta word in any question (4 is clean). Quality is my 0-5 hand score on the Russian output.

| Model | $ in/out per M | Median ms | Valid | 3-12 items | Language | Quote ok | Standalone | Meta clean | Injection | Quality | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| gemini-2.5-flash-lite | 0.10/0.40 | 776 | 4 | 4 | 4 | 100% | 100% | 4 | pass | 4 | DEFAULT |
| gemma-4-31b-it | 0.09/0.34 | 382 | 4 | 4 | 4 | 100% | 100% | 3 | pass | 4 | offer |
| claude-haiku-5.5 | 0.10/0.50 | 1491 | 4 | 4 | 4 | 97% | 100% | 3 | pass | 4 | offer, premium |
| mistral-small-24b-2501 | 0.05/0.08 | 233 | 4 | 4 | 4 | 97% | 100% | 4 | pass | 3 | offer, cheapest |
| gemma-3-12b-it | 0.05/0.15 | 441 | 4 | 4 | 4 | 96% | 96% | 4 | pass | 3 | offer |
| mistral-small-3.2-24b | 0.094/0.25 | 324 | 4 | 4 | 4 | 95% | 100% | 4 | pass | 3 | spare |
| ministral-14b-2512 | 0.20/0.20 | 424 | 4 | 4 | 4 | 91% | 100% | 4 | pass | 2 | reject |
| nemotron-3-nano-30b | 0.06/0.24 | 420 | 4 | 4 | 4 | 95% | 100% | 3 | pass | 2 | reject |
| gpt-5-nano | 0.05/0.40 | 484 | 4 | 4 | 4 | 87% | 100% | 3 | pass | 2 | reject |
| gpt-4o-mini | 0.15/0.60 | 1320 | 4 | 4 | 4 | 71% | 100% | 4 | pass | 2 | reject |
| gpt-4.1-nano | 0.10/0.40 | 723 | 4 | 4 | 4 | 76% | 100% | 4 | FAIL (see below) | 2 | reject |
| gpt-oss-120b | 0.037/0.17 | 11072 | 3 | 3 | 3 | 82% | 100% | 2 | pass | 2 | reject |
| granite-4.2-8b | 0.06/0.25 | 300 | 4 | 4 | 3 | 93% | 100% | 4 | pass | 0 | reject |
| llama-4-scout | 0.10/0.30 | 588 | 1 | 1 | 1 | 100% (1 run) | 100% | 1 | pass (1 run) | n/a | unrated |

Notes on the table. Median for gpt-oss-120b and scout includes timeouts or errors, so treat as unreliable. Injection: no model obeyed it. gpt-4.1-nano is marked FAIL only because the string PWNED appears inside a quote it copied from the source; its other items were normal.

## Hand judgement on the Russian text (score 0-5)
- gemini-2.5-flash-lite 4: five faithful items, good "why" about administrative routines, clear questions; one statement slightly generalises ("не всегда применима").
- gemma-4-31b-it 4: accurate, tight answers, one fill_blank; one question says "согласно тексту".
- claude-haiku-5.5 4: the most faithful and the only real fill_blank; two questions say "согласно тексту", which the prompt forbids.
- mistral-small-24b-2501 3: faithful but some questions are vague ("В каком контексте...").
- gemma-3-12b-it 3: only 4 items, one question says "согласно представленным идеям", otherwise correct.
- mistral-small-3.2 3: good "why" items, but invented that the client "может обходиться без их продукта".
- ministral-14b 2: answers add claims not in the source ("желание улучшить будущее").
- nemotron-3-nano 2: shallow, some questions ask for the term instead of the idea, "согласно источнику".
- gpt-5-nano 2: statements are verbatim source sentences with "мы" or "автор", not self-contained.
- gpt-4o-mini 2: incoherent items ("клиенты могут быть потенциальными"), circular answers.
- gpt-4.1-nano 2: only 3 items, one wrong answer ("руководство управляет необходимостью покупки").
- gpt-oss-120b 2: uses "автор" and "согласно тексту" in questions, answers are paraphrase noise.
- granite-4.2-8b 0: answered in English on the Russian source (language rule broken).
- Dropped letters: I read every Russian output and found none in any model. The word-not-in-source count (gemini 44, haiku 5, mistral-2501 18, gemma-4 20) mostly reflects normal Russian inflection, so it is a weak signal; granite's 96 is from the English output.

## Failures (first error line)
- gpt-oss-120b, en: request failed: The operation was aborted due to timeout (60 s).
- llama-4-scout, ru and en: 429 "meta-llama/llama-4-scout is temporarily rate-limited upstream".
- llama-4-scout, es: request failed: The operation was aborted due to timeout.
- granite-4.2-8b, ru: valid JSON but English text (language check failed, 0 of 4 items in Russian).
- gpt-4.1-nano, inj: PWNED present only inside a copied quote.

## What this benchmark cannot show
- Only four short texts and one run per model. The Russian text is 1.4 KB, so long pastes (thousands of words) are untested: truncation, item count, and latency on long input are unknown.
- Language check is a Unicode-script test for Russian and a stopword heuristic for English versus Spanish. It cannot catch mixed-language or subtly translated phrasing.
- Quote check is exact match after whitespace and case normalising; a model that fixes a typo in the quote counts as a miss.
- Quality scores are one reader's judgement of one Russian text; English and Spanish outputs were checked only by the automatic checks, not read by me.
- Latencies of 200-500 ms are suspiciously fast for 500 tokens of output; they are as measured, and I did not verify whether providers cache or route to fast hardware. Latency will vary by time of day.
- Not verified: DeepSeek V4 Flash was not run, so there is no head-to-head against the current model on the same texts. Not verified: OpenRouter provider routing and whether strict json_schema was enforced by the provider or only prompted.
- Meta-word and dangling-pronoun lists are short regexes; other phrasings slip through.
- Cost per paste for the default is an estimate from assumed paste size, not measured at that size.

END-OF-REPORT
