WITH RECURSIVE tree AS (
  SELECT "id", lower(trim("name")) AS path, lower(trim("name")) AS leaf, 1 AS depth
  FROM "subjects" WHERE "parent_id" IS NULL
  UNION ALL
  SELECT c."id", tree.path || '>' || lower(trim(c."name")), lower(trim(c."name")), tree.depth + 1
  FROM "subjects" c JOIN tree ON c."parent_id" = tree."id"
  WHERE tree.depth < 10
),
by_path(path, text) AS (VALUES
  ('business', $ext$Write fronts that ask what, why or how, one idea per card. Card definitions, named frameworks with their author, concrete numbers and the conditions where advice holds. Skip slogans, motivational filler and anecdotes with no lesson. Cards keep the language of the source.$ext$),
  ('business>sales', $ext$Ask what a tactic is, why it works and how to apply it, one tactic per card. Card stage definitions, named methods with their author and conversion figures. Skip sales folklore and generic pep talk. Cards keep the language of the source.$ext$),
  ('business>sales>cold sales', $ext$Ask how to open, follow up and handle each channel, with a short sample line in the answer. Card channel rules, consent and anti-spam limits, and benchmark rates with their source. Skip vague tips like be confident. Cards keep the language of the source.$ext$),
  ('business>sales>sales process', $ext$Ask what each stage is, what enters and exits it, and how a metric is calculated. Card stage definitions, criteria and conversion formulas with the framework name. Skip company-specific CRM clicks. Cards keep the language of the source.$ext$),
  ('business>sales>objection handling', $ext$Put the objection on the front and the reason behind it plus a sample reply on the back. Card common objections, the underlying concern and the reply pattern. Skip manipulative tricks and scripts with no reasoning. Cards keep the language of the source.$ext$),
  ('business>sales>b2b sales', $ext$Ask who is involved, why a step exists and how a deal progresses. Card buying roles, procurement steps, pricing and contract terms, noting where deal size changes the rule. Skip B2C advice and generic closing lines. Cards keep the language of the source.$ext$),
  ('business>time management', $ext$Ask what a method is, who proposed it and how to apply it. Card the method's rule, its author and the evidence for it. Skip productivity slogans and app reviews. Cards keep the language of the source.$ext$),
  ('business>smm', $ext$Ask what a feature or tactic does, why it works and how to use it. Card platform mechanics and tactics with the year they were true. Skip trend chasing and vanity metrics. Cards keep the language of the source.$ext$),
  ('business>negotiations', $ext$Ask what a tactic is, where it comes from and when it backfires. Card the tactic, its source such as Fisher and Ury or Voss, and a one-line example. Skip generic win-win statements. Cards keep the language of the source.$ext$),
  ('business>negotiation', $ext$Ask what a tactic is, where it comes from and when it backfires. Card the tactic, its source such as Fisher and Ury or Voss, and a one-line example. Skip generic win-win statements. Cards keep the language of the source.$ext$),
  ('business>hr', $ext$Ask what a practice is, why it exists and how it is applied. Card definitions, processes and legal rules with the jurisdiction named. Skip opinions about company culture. Cards keep the language of the source.$ext$),
  ('business>hiring', $ext$Ask how a step of hiring works and why. Card structured interview methods, sourcing steps, offer elements and legal limits on questions with the country. Skip anecdotes about single candidates. Cards keep the language of the source.$ext$),
  ('business>marketing', $ext$Ask what a term means, how a metric is calculated and why a model is used. Card exact definitions of CAC, LTV and funnel stages, with the model's author. Skip buzzwords and campaign stories. Cards keep the language of the source.$ext$),
  ('business>loyalty', $ext$Ask what a metric measures and how it is calculated. Card NPS, churn and retention definitions with formulas and a small worked example. Skip generic customer-delight advice. Cards keep the language of the source.$ext$),
  ('business>director', $ext$Ask what a duty is, why it exists and how it is exercised. Card governance duties, liabilities and decision rights with the jurisdiction named. Skip leadership slogans. Cards keep the language of the source.$ext$),
  ('business>communication', $ext$Ask how to say or structure a message and why it works. Card techniques with a short example phrasing and note where norms differ by culture. Skip vague advice like listen more. Cards keep the language of the source.$ext$),
  ('business>networking', $ext$Ask how to open, follow up and give value, with a concrete example. Card specific tactics and when they work. Skip generic tips like be authentic. Cards keep the language of the source.$ext$),
  ('business>management', $ext$Ask what a framework is, who proposed it and when it fits a team. Card the framework, its author and its limits. Skip leadership clichés. Cards keep the language of the source.$ext$),
  ('business>management>delegation', $ext$Ask what to hand over, how to set the outcome and check-ins, and which mistakes to avoid. Card the delegation levels and rules of thumb with an example. Skip abstract talk about trust. Cards keep the language of the source.$ext$),
  ('business>management>people management', $ext$Ask how to run a one-to-one, give feedback or coach, with a concrete phrasing. Card research-backed practices and name their source. Skip personal opinion and anecdotes. Cards keep the language of the source.$ext$),
  ('business>leadership', $ext$Ask what a theory claims, who proposed it and how well evidence supports it. Card the theory, its author and a practical use. Skip inspirational quotes. Cards keep the language of the source.$ext$),
  ('business>customer success', $ext$Ask how a metric is defined and what action follows. Card health score, churn, expansion and renewal definitions with a worked example. Skip generic customer-first slogans. Cards keep the language of the source.$ext$),
  ('business>entrepreneurship', $ext$Ask what a framework is and when to use it. Card named methods such as lean startup with their author and the decision they support. Skip founder anecdotes with no transferable lesson. Cards keep the language of the source.$ext$),
  ('business>finance', $ext$Ask what a term means, how a figure is calculated and why. Card formulas with units, accounting standard differences such as US GAAP versus IFRS, and a small worked number. Skip market predictions. Cards keep the language of the source.$ext$),
  ('business>operations', $ext$Ask what a method is, how it is measured and when to use it. Card lean, six sigma and queueing terms with exact definitions and a small worked example. Skip factory-specific details. Cards keep the language of the source.$ext$),
  ('business>product', $ext$Ask what a framework is, who proposed it and how to apply it. Card the framework, its formula or steps, and a short example. Skip feature opinions. Cards keep the language of the source.$ext$),
  ('business>strategy', $ext$Ask what a model says, who authored it and where it stops being useful. Card the model's parts and its author. Skip case-study narration with no takeaway. Cards keep the language of the source.$ext$),
  ('investing', $ext$Ask what a term means, how a figure is calculated and why it matters. Card exact definitions, formulas with units, and dated figures. Skip price predictions and stock tips. Cards keep the language of the source.$ext$),
  ('english', $ext$Ask for the rule, the meaning or the correct form, with a short natural example sentence. Card grammar rules, word meanings, collocations and British versus American usage. Skip rare words and trivia about the language. Cards keep the language of the source.$ext$),
  ('english>english for it', $ext$Ask what a word or phrase means and when to use it at work, with a short example. Card IT vocabulary and phrasing for standups, reviews and emails, with the register. Skip general-purpose vocabulary. Cards keep the language of the source.$ext$),
  ('polish', $ext$Ask for the meaning, the correct form or the rule, with a short Polish example and its meaning. Card words, cases, gender, verb aspect and register. Skip rare words and etymology. Cards keep the language of the source.$ext$),
  ('spanish', $ext$Ask for the meaning, the correct form or the rule, with a short example. Card words, conjugation, ser versus estar, gender and Spain versus Latin America usage. Skip rare words and etymology. Cards keep the language of the source.$ext$),
  ('swedish', $ext$Ask for the meaning, the correct form or the rule, with a short example. Card words, en and ett genders, word order and register. Skip rare words and etymology. Cards keep the language of the source.$ext$),
  ('music', $ext$Ask what a term, interval or concept is and how it sounds or is notated. Card standard terminology, notation and theory rules, giving the key or tempo when it matters. Skip taste and opinions about artists. Cards keep the language of the source.$ext$),
  ('webdev', $ext$Ask what a feature does, why it exists and how to use it, naming the browser or framework version. Card standards behaviour, API signatures in words and common pitfalls. Skip tool hype and opinions. Cards keep the language of the source.$ext$),
  ('programming / web development', $ext$Ask what a construct does, why and how to use it, naming the language or version. Card official behaviour and a short correct example described in plain words. Skip hype and tutorial narration. Cards keep the language of the source.$ext$)
),
by_name(leaf, text) AS (VALUES
  ('databases', $ext$Ask what a concept or statement does, why and when to use it, naming the engine and version when behaviour differs. Card SQL semantics, index and transaction rules and trade-offs. Skip vendor marketing. Cards keep the language of the source.$ext$),
  ('architecture', $ext$Ask what a pattern is, what trade-off it makes and when it is the wrong choice. Card the pattern, its source or author and its limits. Skip buzzword lists. Cards keep the language of the source.$ext$),
  ('ai', $ext$Ask what a technique is, how it works and what it is limited by, naming the paper or model and its date. Card established results and definitions. Skip hype and unverified claims. Cards keep the language of the source.$ext$),
  ('cloud computing', $ext$Ask what a service does, how its limits work and why one is chosen, naming the provider. Card service roles, quotas and pricing rules from official docs. Skip cross-provider generalities. Cards keep the language of the source.$ext$)
),
matched AS (
  SELECT tree."id", by_path.text FROM tree JOIN by_path ON by_path.path = tree.path
  UNION
  SELECT tree."id", by_name.text FROM tree JOIN by_name ON by_name.leaf = tree.leaf
)
UPDATE "subjects" s
SET "extraction_instructions" = (SELECT m.text FROM matched m WHERE m."id" = s."id" ORDER BY m.text LIMIT 1)
WHERE s."extraction_instructions" IS NULL
  AND EXISTS (SELECT 1 FROM matched m WHERE m."id" = s."id");
