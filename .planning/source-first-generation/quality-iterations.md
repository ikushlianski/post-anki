# Source items quality iterations

Scope: Russian and English only (user decision). Spanish/Ukrainian dropped. Eval: `node --import tsx scripts/source-items-eval.mjs 2` (2 runs per case; table shows run 1 items, median ms and mean cost over the runs; items go through the real orchestrator, prompt and validator). Outputs were read by hand against rubric a-g. "returned/valid" counts every model call including a retry; "stored" is after per-chunk (8) and per-source (40) caps.

## Round 1 - language hint, language-only retry, guard fixes, whole-eval baseline

Changes: deterministic language line before <source> (Cyrillic -> "Russian (Cyrillic)", Latin -> "English", else "same language as the source text"); retry once with a stronger message when every item of a chunk was dropped for wrong_language, then fail with reason wrong_language; guard no longer treats acronyms, digit tokens and camelCase (SQL, API, Redis 7, PostgreSQL) as a foreign-language run; orchestrator fixtures for the three failing tests rewritten in Russian (they used English statements for a Russian source, which the guard correctly rejects; no real false positive).

```
┌─────────┬──────────────┬───────────────────────────────────┬────────┬────────────────┬────────┬─────────────────────────────┬────────────┬───────────┬─────────┐
│ (index) │ text         │ model                             │ status │ returned/valid │ stored │ dropped                     │ languageOk │ median ms │ cost $  │
├─────────┼──────────────┼───────────────────────────────────┼────────┼────────────────┼────────┼─────────────────────────────┼────────────┼───────────┼─────────┤
│ 0       │ 'en-indexes' │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '8/8'          │ 8      │ '{}'                        │ true       │ 922       │ 0.00049 │
│ 1       │ 'en-indexes' │ 'gemma-4-31b-it'                  │ 'ok'   │ '7/7'          │ 7      │ '{}'                        │ true       │ 759       │ 0.0004  │
│ 2       │ 'en-indexes' │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '7/7'          │ 7      │ '{}'                        │ true       │ 550       │ 0.00012 │
│ 3       │ 'en-long'    │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '16/16'        │ 16     │ '{}'                        │ true       │ 1821      │ 0.00097 │
│ 4       │ 'en-long'    │ 'gemma-4-31b-it'                  │ 'ok'   │ '15/15'        │ 15     │ '{}'                        │ true       │ 1319      │ 0.00149 │
│ 5       │ 'en-long'    │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '16/14'        │ 14     │ '{"quote_not_in_source":2}' │ true       │ 1010      │ 0.00022 │
│ 6       │ 'ru'         │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '4/4'          │ 4      │ '{}'                        │ true       │ 916       │ 0.00032 │
│ 7       │ 'ru'         │ 'gemma-4-31b-it'                  │ 'ok'   │ '3/2'          │ 2      │ '{"bad_blank":1}'           │ true       │ 622       │ 0.00024 │
│ 8       │ 'ru'         │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '8/6'          │ 4      │ '{"bad_blank":2}'           │ true       │ 1025      │ 0.00015 │
│ 9       │ 'ru-messy'   │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '6/6'          │ 6      │ '{}'                        │ true       │ 972       │ 0.00041 │
│ 10      │ 'ru-messy'   │ 'gemma-4-31b-it'                  │ 'ok'   │ '5/4'          │ 4      │ '{"bad_blank":1}'           │ true       │ 686       │ 0.0003  │
│ 11      │ 'ru-messy'   │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '6/4'          │ 4      │ '{"bad_blank":2}'           │ true       │ 855       │ 0.0001  │
└─────────┴──────────────┴───────────────────────────────────┴────────┴────────────────┴────────┴─────────────────────────────┴────────────┴───────────┴─────────┘
```

Verdict: language fixed everywhere (gemini and mistral now answer in Russian). Gemma on ru returned only 2-3 items (coverage fail), fill_blank items were dropped as bad_blank. English texts good on gemma and gemini. Mistral en-long weak (see later rounds).

## Round 2 - coverage prompt, fill_blank downgrade

Changes: prompt tells the model to list every claim (incl. negations) first and not stop after the first paragraph; a malformed fill_blank whose question is a good direct question is kept as a basic item instead of dropped.

```
┌─────────┬──────────────┬───────────────────────────────────┬────────┬────────────────┬────────┬───────────────────┬────────────┬───────────┬─────────┐
│ (index) │ text         │ model                             │ status │ returned/valid │ stored │ dropped           │ languageOk │ median ms │ cost $  │
├─────────┼──────────────┼───────────────────────────────────┼────────┼────────────────┼────────┼───────────────────┼────────────┼───────────┼─────────┤
│ 0       │ 'en-indexes' │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '8/8'          │ 8      │ '{}'              │ true       │ 861       │ 0.0005  │
│ 1       │ 'en-indexes' │ 'gemma-4-31b-it'                  │ 'ok'   │ '7/7'          │ 7      │ '{}'              │ true       │ 816       │ 0.00042 │
│ 2       │ 'en-indexes' │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '7/7'          │ 7      │ '{}'              │ true       │ 486       │ 0.00012 │
│ 3       │ 'en-long'    │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '16/16'        │ 16     │ '{}'              │ true       │ 1728      │ 0.00098 │
│ 4       │ 'en-long'    │ 'gemma-4-31b-it'                  │ 'ok'   │ '16/16'        │ 16     │ '{}'              │ true       │ 2041      │ 0.0019  │
│ 5       │ 'en-long'    │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '16/16'        │ 16     │ '{}'              │ true       │ 1614      │ 0.00022 │
│ 6       │ 'ru'         │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '6/6'          │ 6      │ '{}'              │ true       │ 943       │ 0.0004  │
│ 7       │ 'ru'         │ 'gemma-4-31b-it'                  │ 'ok'   │ '3/2'          │ 2      │ '{"bad_blank":1}' │ true       │ 631       │ 0.00043 │
│ 8       │ 'ru'         │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '4/4'          │ 4      │ '{}'              │ true       │ 492       │ 0.00011 │
│ 9       │ 'ru-messy'   │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '8/8'          │ 8      │ '{}'              │ true       │ 929       │ 0.00045 │
│ 10      │ 'ru-messy'   │ 'gemma-4-31b-it'                  │ 'ok'   │ '6/5'          │ 5      │ '{"bad_blank":1}' │ true       │ 661       │ 0.00052 │
│ 11      │ 'ru-messy'   │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '6/6'          │ 6      │ '{}'              │ true       │ 515       │ 0.00011 │
└─────────┴──────────────┴───────────────────────────────────┴────────┴────────────────┴────────┴───────────────────┴────────────┴───────────┴─────────┘
```

Verdict: no more bad_blank losses for mistral/ru-messy. Gemma ru still 2 items (a yes/no fill_blank for the metaphor claim was dropped). Gemini ru: duplicate claims, a garbled question, a yes/no basic question.

## Round 3 - fill_blank repair, faithfulness rules

Changes: when a fill_blank question is malformed, the question is rebuilt from the statement by replacing the single occurrence of the answer with ____; prompt adds claim-strength ("not necessary" is not "forbidden") and no-duplicate-facts rules.

```
┌─────────┬──────────────┬───────────────────────────────────┬────────┬────────────────┬────────┬───────────────────────────────┬────────────┬───────────┬─────────┐
│ (index) │ text         │ model                             │ status │ returned/valid │ stored │ dropped                       │ languageOk │ median ms │ cost $  │
├─────────┼──────────────┼───────────────────────────────────┼────────┼────────────────┼────────┼───────────────────────────────┼────────────┼───────────┼─────────┤
│ 0       │ 'en-indexes' │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '8/8'          │ 8      │ '{}'                          │ true       │ 834       │ 0.0005  │
│ 1       │ 'en-indexes' │ 'gemma-4-31b-it'                  │ 'ok'   │ '7/7'          │ 7      │ '{}'                          │ true       │ 598       │ 0.00042 │
│ 2       │ 'en-indexes' │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '7/6'          │ 6      │ '{"bad_blank":1}'             │ true       │ 1423      │ 0.00013 │
│ 3       │ 'en-long'    │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '16/16'        │ 16     │ '{}'                          │ true       │ 1868      │ 0.00102 │
│ 4       │ 'en-long'    │ 'gemma-4-31b-it'                  │ 'ok'   │ '16/16'        │ 16     │ '{}'                          │ true       │ 1310      │ 0.0021  │
│ 5       │ 'en-long'    │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '16/16'        │ 16     │ '{}'                          │ true       │ 1033      │ 0.00023 │
│ 6       │ 'ru'         │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '5/4'          │ 4      │ '{"source_meta_reference":1}' │ true       │ 1282      │ 0.00041 │
│ 7       │ 'ru'         │ 'gemma-4-31b-it'                  │ 'ok'   │ '3/3'          │ 3      │ '{}'                          │ true       │ 641       │ 0.00028 │
│ 8       │ 'ru'         │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '6/6'          │ 6      │ '{}'                          │ true       │ 484       │ 0.00011 │
│ 9       │ 'ru-messy'   │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '6/6'          │ 6      │ '{}'                          │ true       │ 921       │ 0.00041 │
│ 10      │ 'ru-messy'   │ 'gemma-4-31b-it'                  │ 'ok'   │ '6/6'          │ 6      │ '{}'                          │ true       │ 659       │ 0.00036 │
│ 11      │ 'ru-messy'   │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '8/7'          │ 7      │ '{"quote_not_in_source":1}'   │ true       │ 521       │ 0.00012 │
└─────────┴──────────────┴───────────────────────────────────┴────────┴────────────────┴────────┴───────────────────────────────┴────────────┴───────────┴─────────┘
```

Verdict: gemma ru now 3 items including the metaphor claim as a proper fill_blank; ru-messy all pass on gemma and gemini. Gemini ru still has a yes/no question; mistral ru has duplicates.

## Round 4 - yes/no question check

Changes: new validator rejects basic/why items whose question is a yes/no question (English auxiliary start, Russian "ли", or an answer that is just yes/no/да/нет).

```
┌─────────┬──────────────┬───────────────────────────────────┬────────┬────────────────┬────────┬─────────────────────────────┬────────────┬───────────┬─────────┐
│ (index) │ text         │ model                             │ status │ returned/valid │ stored │ dropped                     │ languageOk │ median ms │ cost $  │
├─────────┼──────────────┼───────────────────────────────────┼────────┼────────────────┼────────┼─────────────────────────────┼────────────┼───────────┼─────────┤
│ 0       │ 'en-indexes' │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '8/8'          │ 8      │ '{}'                        │ true       │ 1233      │ 0.00052 │
│ 1       │ 'en-indexes' │ 'gemma-4-31b-it'                  │ 'ok'   │ '7/7'          │ 7      │ '{}'                        │ true       │ 666       │ 0.0009  │
│ 2       │ 'en-indexes' │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '7/7'          │ 7      │ '{}'                        │ true       │ 543       │ 0.00013 │
│ 3       │ 'en-long'    │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '16/16'        │ 16     │ '{}'                        │ true       │ 2287      │ 0.00102 │
│ 4       │ 'en-long'    │ 'gemma-4-31b-it'                  │ 'ok'   │ '16/16'        │ 16     │ '{}'                        │ true       │ 1151      │ 0.00174 │
│ 5       │ 'en-long'    │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '16/16'        │ 16     │ '{}'                        │ true       │ 1539      │ 0.00023 │
│ 6       │ 'ru'         │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '5/4'          │ 4      │ '{"bad_card":1}'            │ true       │ 1245      │ 0.00038 │
│ 7       │ 'ru'         │ 'gemma-4-31b-it'                  │ 'ok'   │ '3/3'          │ 3      │ '{}'                        │ true       │ 696       │ 0.00027 │
│ 8       │ 'ru'         │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '6/5'          │ 5      │ '{"quote_not_in_source":1}' │ true       │ 496       │ 0.00012 │
│ 9       │ 'ru-messy'   │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '7/7'          │ 7      │ '{}'                        │ true       │ 1270      │ 0.00043 │
│ 10      │ 'ru-messy'   │ 'gemma-4-31b-it'                  │ 'ok'   │ '6/6'          │ 6      │ '{}'                        │ true       │ 640       │ 0.00035 │
│ 11      │ 'ru-messy'   │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '6/6'          │ 6      │ '{}'                        │ true       │ 574       │ 0.00011 │
└─────────┴──────────────┴───────────────────────────────────┴────────┴────────────────┴────────┴─────────────────────────────┴────────────┴───────────┴─────────┘
```

Verdict: gemini ru yes/no item is now dropped, but that loses the metaphor claim (coverage gap on gemini ru). Mistral ru has a vague answer ("Иначе").

## Round 5 - hedges, first person, vague answers

Changes: prompt: keep hedges, replace we/our/I with the real subject, an answer carries the whole fact (no single vague word).

```
┌─────────┬──────────────┬───────────────────────────────────┬────────┬────────────────┬────────┬─────────────────────────────┬────────────┬───────────┬─────────┐
│ (index) │ text         │ model                             │ status │ returned/valid │ stored │ dropped                     │ languageOk │ median ms │ cost $  │
├─────────┼──────────────┼───────────────────────────────────┼────────┼────────────────┼────────┼─────────────────────────────┼────────────┼───────────┼─────────┤
│ 0       │ 'en-indexes' │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '8/7'          │ 7      │ '{"quote_not_in_source":1}' │ true       │ 903       │ 0.00054 │
│ 1       │ 'en-indexes' │ 'gemma-4-31b-it'                  │ 'ok'   │ '7/7'          │ 7      │ '{}'                        │ true       │ 520       │ 0.00142 │
│ 2       │ 'en-indexes' │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '7/5'          │ 5      │ '{"quote_not_in_source":2}' │ true       │ 486       │ 0.00012 │
│ 3       │ 'en-long'    │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '16/16'        │ 16     │ '{}'                        │ true       │ 2083      │ 0.00105 │
│ 4       │ 'en-long'    │ 'gemma-4-31b-it'                  │ 'ok'   │ '16/16'        │ 16     │ '{}'                        │ true       │ 1235      │ 0.00184 │
│ 5       │ 'en-long'    │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '16/15'        │ 15     │ '{"quote_not_in_source":1}' │ true       │ 1092      │ 0.00024 │
│ 6       │ 'ru'         │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '6/5'          │ 5      │ '{"bad_card":1}'            │ true       │ 974       │ 0.00042 │
│ 7       │ 'ru'         │ 'gemma-4-31b-it'                  │ 'ok'   │ '4/4'          │ 4      │ '{}'                        │ true       │ 633       │ 0.00031 │
│ 8       │ 'ru'         │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '5/5'          │ 4      │ '{}'                        │ true       │ 604       │ 0.00011 │
│ 9       │ 'ru-messy'   │ 'gemini-2.5-flash-lite'           │ 'ok'   │ '6/6'          │ 6      │ '{}'                        │ true       │ 912       │ 0.00041 │
│ 10      │ 'ru-messy'   │ 'gemma-4-31b-it'                  │ 'ok'   │ '6/6'          │ 6      │ '{}'                        │ true       │ 622       │ 0.00035 │
│ 11      │ 'ru-messy'   │ 'mistral-small-24b-instruct-2501' │ 'ok'   │ '6/6'          │ 6      │ '{}'                        │ true       │ 1016      │ 0.00012 │
└─────────┴──────────────┴───────────────────────────────────┴────────┴────────────────┴────────┴─────────────────────────────┴────────────┴───────────┴─────────┘
```

Verdict: gemma passes all four hard texts. Gemini passes en-indexes, en-long and ru-messy but fails ru (duplicate reason claim, metaphor claim dropped as yes/no). Mistral fails en-long (questions such as "What did standard textbooks make easier?", answers restate the question) and ru (vague "Иначе, чем сейчас").

## Final scores (round 5, rubric a-g, hand-judged)

| text | gemma-4-31b-it | gemini-2.5-flash-lite | mistral-small-24b |
|---|---|---|---|
| ru | PASS (4 items; "Почему не обязательно..." style claims covered; small-company hedge not carded) | FAIL (a: metaphor claim lost to yes/no drop; b/c: item 2 and 3 duplicate the same reason) | FAIL (b: "Клиент видит свое будущее иначе, чем сейчас" is not self-contained, answer vague) |
| ru-messy | PASS (6 items incl. blank on allkeys-lru; code and URL handled) | PASS | PASS (weak: statements and questions often split a claim into near-trivial questions) |
| en-indexes | PASS (7 items, why for composite index, writes, event logs) | PASS (7; one lookup-time item lost to a non-verbatim quote) | PASS with weaker coverage (5 items, 2 dropped for quote) |
| en-long | PASS, but cap-limited: 16 of ~22 claims (Gutenberg date, newspapers, Dutch Republic, anatomical atlases not carded) | PASS | FAIL (c/b: "What did the press help spread?", "What did standard textbooks make easier?") |

Language (e): ok for all 12 cases on every round after round 1. Hint line makes gemini and mistral write Russian.

Stop condition NOT met. Hard criteria: gemma passes ru, ru-messy, en-indexes, en-long. No cheaper model passes all four: gemini fails ru only (a small-text coverage/duplication problem, model quality), mistral fails ru and en-long. Remaining failures are model quality, not code: gemini-2.5-flash-lite on the 3-paragraph Russian text repeats the reason claim and asks a yes/no question for the metaphor claim; the validator now correctly drops it, which loses that claim. Gemini is the recommended cheaper alternative (passes 3 of 4).

Other facts: coverage on en-long is bounded by the unchanged cap of 8 items per chunk (2 chunks). The model-written fill_blank question is now rebuilt deterministically from the statement when malformed; this changes two former rejection tests (two blanks, yes/no with blank) into repair tests. depcruise reports 2 errors, both inside apps/web/storybook-static build output (not part of this change). The repo has no lint script; typecheck is clean.

## Final outputs: ru text on google/gemma-4-31b-it (round 5)

1. [basic]
   statement: При продаже софта большой компании не обязательно искать боли клиента, достаточно показать компании новое видение своего будущего.
   question: Что нужно сделать вместо поиска болей клиента при продаже софта большой компании?
   answer: Показать этой большой компании новое видение своего будущего.
   quote: нам не обязательно искать боли клиента, как часто учат маркетологи. Просто нам нужно показать этой большой компании новое видение своего будущего.

2. [why]
   statement: Руководство фирмы осознает потребность в покупке софта, потому что само не удовлетворено текущими административными рутинами.
   question: Почему руководство фирмы осознает потребность в покупке софта?
   answer: Потому что оно само не удовлетворено текущими административными рутинами.
   quote: руководство фирмы наконец-то осознает потребность в покупке софта, потому что оно само не удовлетворено текущими административными рутинами.

3. [basic]
   statement: Неудовлетворенность руководства административными рутинами является не болью клиента, а иным видением клиентом своего будущего.
   question: Чем является неудовлетворенность руководства текущими административными рутинами с точки зрения видения будущего?
   answer: Это не боль клиента, а просто иное видение клиентом своего будущего.
   quote: То есть это не боль клиента, а просто иное видение клиентом своего будущего.

4. [fill_blank]
   statement: Метафора «клиентская боль» на самом деле не существует в мире корпораций.
   question: Метафора «____» на самом деле не существует в мире корпораций.
   answer: клиентская боль
   quote: Популярная в обучении и продажах метафора «клиентская боль» на самом деле не существует в мире корпораций.

END-OF-REPORT
