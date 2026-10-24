# Model comparison

## What it is for

The Compare models page (`/admin-compare-models`, linked from the admin settings page) lets an admin paste one excerpt, tick several extraction models, run them side by side and grade the results. Every run and every grade is stored in Postgres, so the data can be read again at any time. Grades from comparison runs count toward the default-model suggestion together with the grades given on the review page. Nothing a comparison produces becomes a real source, suggestion or card.

## What the admin sees

- A list of the usable models, each with its price per 1M input and output tokens. Nothing is preselected. A model that OpenRouter has retired (past its `expiresOn`) is not offered.
- An estimated cost line that updates while the excerpt or the model choice changes. A run that would pass the cost cap shows "Over the cap" and cannot start.
- A progress state ("Running…") while the models work.
- One column per model after the run: the cards that passed the production checks (question and answer), the number kept out of the number returned, the time, and the names of the checks that dropped cards. A model that fails shows its error and does not hide the others.
- Under each model's header a line with the actual tokens and cost of that model's run, for example "Actual (successful calls): 2,410 in / 930 out tokens, about $0.0007 (estimate was $0.0012)". When the provider did not report usage for every chunk the line says "usage not reported"; a number is never guessed. A failed model shows no usage line.
- Under each card two 1 to 5 grades (Card quality, Question wording). Under each model one 1 to 5 grade for how well the excerpt was split into cards, with an optional note. Every grade is saved to the server when it is chosen (the note after a short pause). A failed save shows an error and keeps the chosen value so it can be tried again.
- A list of the latest 20 runs. Opening one shows its stored results and grades.

## Helpers for reaching the default-model evidence

- A quiet line above the excerpt shows the progress toward the default-model suggestion with the same wording as the admin settings page ("Not enough grades yet: N of 5 models have 3 graded runs", with a collapsible per-model list), or the suggested model once enough runs are graded. The page never sets the default; only the admin settings page has the "Use as default" action.
- A sample picker above the excerpt fills the textarea with one of three shipped samples (a Russian sales text, a Russian Redis text and an English technical text trimmed under 3000 characters). Nothing is filled until the admin chooses a sample, and every sample stays inside the excerpt cap.
- "Run again" on the results view and on every earlier comparison repeats the same excerpt and the same models as a new run with its own id and no grades. The server applies the same validation and cost cap as for a first run, and the button is disabled while a run is in progress.

## Limits per run

- At most 6 models, an excerpt of at most 6000 characters and an estimated cost of at most $0.25 (`packages/shared/src/model-comparison.ts`). The server enforces all three; the page mirrors them.
- Models run three at a time, each with a 120 second timeout.

## How a run works

- The estimate uses the instruction text plus the excerpt at about 2.5 characters per token and 1500 output tokens per 3000-character chunk, priced with each model's own rates. It is an estimate, not a bill.
- A run is a Mastra experiment (`runExperiment` from `@mastra/core/datasets`) over inline data: one item per model, a task function and an in-memory store. Mastra handles concurrency, timeouts and per-item errors. Mastra's own store is discarded after the run; the results and grades are saved in Postgres by the repository.
- Actual usage counts only the calls that returned an answer. A call that failed and was retried is not counted, because a failed call reports no token usage, so the figure can understate the real bill when retries happened. Actual usage comes from the provider's own token counts: `runKnowledgeBitSourceItems` reports them through an optional `onUsage` callback once per call (no change to what it returns), and the runner sums input and output tokens over all chunks of one model. The actual cost is that sum priced with the model's own rates. If any chunk lacked usage, tokens and cost are all null for that model.
- Each model goes through the production extraction path: the excerpt is cut into chunks, `runKnowledgeBitSourceItems` is called per chunk with that model id, and `validateSourceItems` applies the same guards as the app (language, meta wording, quote check, markup guard, blank shape). The reviewer feedback block is not added, so models are compared on equal terms.
- The excerpt is untrusted text. It only reaches a model through the extraction path, which escapes it, and a retired or unknown model id never reaches the provider.

## API

All routes sit under `/admin/model-comparison` and use the same authenticated API as the admin settings page; there is no separate role system.

- `POST /estimate` with `{ excerpt, modelIds }` returns the cost estimate.
- `POST /runs` with the same body validates, answers 400 `over_cost_cap` when the estimate passes the cap, otherwise runs, stores and returns the run with its results.
- `GET /runs` lists the latest 20 runs (id, time, models, 120 character excerpt preview). `GET /runs/:id` returns one run with grades.
- `PATCH /runs/:id/results/:modelId/grade` sets `extractionRating` (1 to 5) and `note`.
- `PATCH /runs/:id/results/:modelId/cards/:index/grade` sets `rating` and `wordingRating` (1 to 5) for one kept card.
- The model id in a path is URL-encoded and must be on the allowlist; the run id must be a UUID.

## Storage

Migration `0094_model_comparison.sql` adds three tables and one view. There are no foreign keys, following the schema convention.

- `model_comparison_run`: id, excerpt, chosen models, estimated cost, time.
- `model_comparison_result`: one row per (run, model) with status, time, returned count, kept cards, dropped check names, error, the extraction grade (1 to 5), its note and the grading time, plus the actual input and output tokens, the actual cost and the per-model cost estimate saved at run time (migration `0095_model_comparison_actual_cost.sql`; all four are null for runs saved before it and for models that did not report usage).
- `model_comparison_card_grade`: one row per (run, model, card position) with the two 1 to 5 grades; a grade given later updates the same row.
- `model_comparison_report`: read-only view with one row per model result: run id, time, model, status, extraction grade and note, average card quality, average question wording, cards kept, cards returned, milliseconds, input tokens, output tokens, actual cost and estimated cost.

Example queries:

```sql
-- average grades per model across all comparison runs
select model_id,
       count(*) filter (where extraction_rating is not null) as graded_runs,
       round(avg(extraction_rating), 2) as extraction,
       round(avg(average_card_quality)::numeric, 2) as card_quality,
       round(avg(average_question_wording)::numeric, 2) as wording
from model_comparison_report
group by model_id
order by extraction desc nulls last;

-- how far the estimate was from the real cost, per model
select model_id,
       count(*) as runs,
       round(avg(estimated_cost_usd), 6) as avg_estimate,
       round(avg(actual_cost_usd), 6) as avg_actual,
       round(avg(actual_cost_usd) / nullif(avg(estimated_cost_usd), 0), 2) as actual_over_estimate
from model_comparison_report
where actual_cost_usd is not null and estimated_cost_usd is not null
group by model_id
order by actual_over_estimate desc;

-- latest runs with timing and kept cards
select created_at, model_id, status, ms, cards_kept, cards_returned, extraction_rating
from model_comparison_report
order by created_at desc, model_id
limit 50;

-- every note written about how a model split an excerpt
select created_at, model_id, extraction_rating, extraction_note
from model_comparison_report
where extraction_note is not null
order by created_at desc;

-- models that failed, with the error
select r.created_at, res.model_id, res.error
from model_comparison_result res
join model_comparison_run r on r.id = res.run_id
where res.status = 'failed'
order by r.created_at desc;
```

## Default model suggestion

The suggestion (`apps/api/src/knowledge-bit/knowledge-bit-model-suggestion.ts`) counts each graded comparison result as one graded run for its model. Its card quality and wording averages are blended with the averages from the review page by graded runs, so each graded run weighs the same. The suggestion still needs 5 models with 3 graded runs each, and it never changes the default by itself.

## Boundaries

- The comparison code lives in `apps/api/src/model-comparison/` and `apps/web/src/model-comparison/`. It writes no rows to sources, bits, variants or the review queue.
- The page reuses the review page's autosave hook for the note, so dictation tools that set a value without input events are saved too.

## Starting from a source

Each source on the approve-suggestions page has a quiet "Compare models on this text" link next to Regenerate. It opens `/admin-compare-models?sourceId=<id>`. The page reads `sourceId` from the search params (a non-empty string, otherwise ignored) and fetches the stored text through the read-only `GET /knowledge-sources/:id/text` (same auth as the other routes; 400 for an id outside the id alphabet, 404 for a missing source or one without text). A reload keeps working because the text comes from the API, not from router state.

- The text fills the excerpt textarea only if the textarea is still empty, and never starts a run. No model is preselected.
- A text longer than the 6000 character cap is cut at a paragraph boundary (a single oversize paragraph is cut at a word boundary), and the page says "Text shortened to fit the 6000 character limit." Editing the textarea or choosing a sample clears that note.
- While the text loads the page shows a quiet loading line. If loading fails it shows an error, and the textarea stays empty and editable.
- The text is untrusted: it is only placed in a textarea as React text, never as HTML, and it goes through the same escaping as any excerpt when a run starts.
