# AI prompt evals

- date: 2026-10-25
- model: openrouter/anthropic/claude-haiku-5.5 (the knowledge-item model the app is configured with, via OpenRouter, default sampling settings)
- prompt files (apps/api/scripts/eval-prompts/, unedited): business-cards-starter.prompt.txt, business-cards-v2-level-aware.prompt.txt, business-cards-v3-self-filter.prompt.txt, business-cards-v4-patterns.prompt.txt
- total cost: $0.00872 over 12 call(s), one call per source per version, filled prompt as a single user message, no system prompt
- done: real model calls and read-only SELECTs on the local dev database
- not done: no database writes, no use of the app's lessons/cards pipeline, no cards saved anywhere
- sources: only the sources that exist in the local dev database were used (see per-source sections); v2 used level 2 and known fronts from other sources in the same subject

## Comparison

### Per source

| Source | Version | Cards | JSON ok | Quotes verbatim | Avg front words | Avg back words | Meta-word fronts | Cost |
|---|---|---|---|---|---|---|---|---|
| 1. Business > Common | starter | 1 | yes | 1/1 | 13.0 | 18.0 | 1 | $0.00066 |
| 1. Business > Common | v2-level-aware | 0 | yes | 0/0 | 0.0 | 0.0 | 0 | $0.00037 |
| 1. Business > Common | v3-self-filter | 2 | yes | 2/2 | 12.5 | 19.0 | 1 | $0.00098 |
| 1. Business > Common | v4-patterns | 0 | yes | 0/0 | 0.0 | 0.0 | 0 | $0.00034 |
| 2. (unfiled) | starter | 3 | yes | 3/3 | 8.3 | 9.3 | 0 | $0.00076 |
| 2. (unfiled) | v2-level-aware | 3 | yes | 3/3 | 9.0 | 13.3 | 1 | $0.00086 |
| 2. (unfiled) | v3-self-filter | 2 | yes | 2/2 | 11.0 | 15.0 | 0 | $0.00089 |
| 2. (unfiled) | v4-patterns | 3 | yes (fence) | 3/3 | 11.3 | 14.7 | 0 | $0.00119 |
| 3. (unfiled) | starter | 2 | yes (fence) | 2/2 | 13.5 | 8.0 | 0 | $0.00050 |
| 3. (unfiled) | v2-level-aware | 2 | yes | 2/2 | 17.5 | 13.5 | 2 | $0.00074 |
| 3. (unfiled) | v3-self-filter | 2 | yes (fence) | 2/2 | 9.5 | 18.5 | 0 | $0.00075 |
| 3. (unfiled) | v4-patterns | 1 | yes | 1/1 | 11.0 | 17.0 | 0 | $0.00070 |

### Totals per version

| Version | Cards | JSON ok | Quotes verbatim | Avg front words | Avg back words | Meta-word fronts | Cost |
|---|---|---|---|---|---|---|---|
| starter | 6 | 3/3 | 6/6 | 10.8 | 10.3 | 1 | $0.00191 |
| v2-level-aware | 5 | 3/3 | 5/5 | 12.4 | 13.4 | 3 | $0.00197 |
| v3-self-filter | 6 | 3/3 | 6/6 | 11.0 | 17.5 | 1 | $0.00262 |
| v4-patterns | 4 | 3/3 | 4/4 | 11.3 | 15.3 | 0 | $0.00222 |

### Version-specific counts

- starter: types: basic 5, cloze 1
- v2-level-aware: types: basic 5, cloze 0
- v3-self-filter: types: basic 6, cloze 0; dropped_ideas total 9
- v4-patterns: types: basic 4, cloze 0; patterns: when_to_use 1, mistake_fix 1, difference 1, definition 1; definition cards 1

## Source 1: Business > Common

- id: ks_7df2da27-4c78-4fe4-985e-a8b517d8b564
- words sent: 120 of 120; output language given: Russian; max cards: 3
- excerpt: "В школе я учился плохо, потому что делал слишком много ошибок. Я получал тройки, двойки, а несколько раз и единицы. Но зато еще в школе я сообразил, что поскольку я так часто делаю ошибки, поскольку так хорошо научился их делать, то мог бы стать кем-то ..."

### starter

tokens: 1147 in, 1084 out; max_cards 3; cost $0.00066

1. type: basic
   - front: Согласно автору, почему частые ошибки могут привести к статусу эксперта в какой-то области?
   - back: Потому что, многократно ошибаясь, он хорошо научился их делать и поэтому мог стать экспертом именно в этом вопросе.
   - context: Это личное рассуждение автора о собственном опыте, а не проверенное общее правило. Оно показывает, как автор объясняет свой путь от плохих школьных оценок к предпринимательству.
   - example: (empty)
   - source_quote: поскольку так хорошо научился их делать, то мог бы стать кем-то вроде эксперта в этом вопросе

skipped_note: Текст в основном состоит из личных историй (школьные оценки, нежелание подчиняться, выбор предпринимательства), которые не дают переносимых бизнес-принципов; остальное оставлено без карточек как мотивация и самоописание.

### v2-level-aware

tokens: 1160 in, 514 out; max_cards 3; cost $0.00037


skipped_note: Текст представляет собой личный рассказ автора о школьных ошибках и выборе роли предпринимателя, а не описание бизнес-фреймворка, метода или управленческого решения. Анекдоты и мотивационные высказывания по правилам пропущены. Единственная мысль, которую можно было бы превратить в карточку (что частые ошибки могут стать основой экспертизы), является личным мнением автора без практического алгоритма, поэтому карточка не создана. Материал также не соответствует уровню 2 (применение фреймворков), так как в тексте нет ни одного применимого инструмента.

### v3-self-filter

tokens: 1215 in, 1709 out; max_cards 3; cost $0.00098

1. type: basic
   - front: Может ли систематическое совершение ошибок стать основой профессиональной экспертности?
   - back: По мнению автора, если хорошо изучить собственные ошибки и способы их совершать, можно стать экспертом именно в этой области.
   - context: Идея о том, что опыт неудач может превратиться в знание, которое ценно в бизнесе.
   - example: (empty)
   - source_quote: поскольку я так часто делаю ошибки, поскольку так хорошо научился их делать, то мог бы стать кем-то вроде эксперта в этом вопросе
2. type: basic
   - front: По какому критерию, согласно автору, выбирать между предпринимательством и наемной работой, если академические способности не решают?
   - back: По склонности к экспериментам и самостоятельности: если человек не любит подчиняться приказам и любит действовать по-своему, ему подходит предпринимательство.
   - context: Автор считает, что тип мотивации и отношение к подчинению важнее академического успеха при выборе карьерного пути.
   - example: (empty)
   - source_quote: Но зато я люблю экспериментировать и делать все по-своему — вместо того, чтобы делать то, что мне велят.

skipped_note: (empty)

dropped_ideas:
- Плохая успеваемость в школе из-за ошибок (Личная история, одноразовый эпизод)
- Академический ум не равен деловым способностям (Самохарактеристика автора, без общего правила)
- Неспособность продвигаться по службе из-за неприятия приказов (Личное самоописание, не применимо как правило)
- Автор стал предпринимателем, а не наемным работником (Итог личной истории, не принцип)

### v4-patterns

tokens: 1202 in, 441 out; max_cards 3; cost $0.00034


skipped_note: Текст представляет собой личную историю автора: школьные оценки, решение стать предпринимателем и любовь к экспериментам. В нем нет методов, процессов, условий применения или сравнения идей, которые можно превратить в карточку. Мысль о том, что частые ошибки могут сделать человека экспертом, является анекдотом и мотивацией, а не применимым бизнес-принципом, поэтому я её пропустил.

### Existing app cards (first 5 of 10 bits)

- statement: Я учился плохо в школе, потому что делал слишком много ошибок.
  - [wh_question] Почему я учился плохо в школе? -> Потому что делал слишком много ошибок.
- statement: Я получал тройки, двойки и иногда единицы.
  - [basic] Какие оценки я получал в школе? -> Тройки, двойки и иногда единицы.
- statement: Я мог бы стать экспертом в ошибках, потому что часто делаю ошибки и хорошо научился их делать.
  - [wh_question] Почему я мог бы стать экспертом в ошибках? -> Потому что часто делаю ошибки и хорошо научился их делать.
- statement: В результате я стал предпринимателем, а не наемным работником.
  - [basic] Кем я стал в результате? -> Предпринимателем, а не наемным работником.
- statement: Я не являюсь умным или толковым человеком в академическом смысле.
  - [basic] Как я описываю себя в академическом смысле? -> Не умный и не толковый.

## Source 2: (unfiled)

- id: ks_ccd560da-03ad-4771-a065-a9cbb6e3cf19
- words sent: 77 of 77; output language given: Russian; max cards: 3
- excerpt: "Принцип 80. 20 гласит, что небольшая доля причин, вкладываемых средств или прилагаемых усилий отвечает за большую долю результатов, получаемой продукции или заработанного вознаграждения». Иначе говоря, в том, что касается успеха, одинаково важно далеко не все. Небольшая доля причин вызывает львиную долю последствий. Почти все результаты ..."

### starter

tokens: 1074 in, 1303 out; max_cards 3; cost $0.00076

1. type: basic
   - front: Что утверждает принцип Парето (80/20)?
   - back: Небольшая доля причин, вложенных средств или усилий отвечает за большую долю результатов.
   - context: Базовая формулировка принципа 80/20, на которой строится выбор приоритетов: результаты распределены неравномерно относительно затрат.
   - example: (empty)
   - source_quote: небольшая доля причин, вкладываемых средств или прилагаемых усилий отвечает за большую долю результатов
2. type: basic
   - front: Какой практический вывод из принципа Парето следует для распределения усилий?
   - back: Сосредоточиться на небольшой избранной части усилий, которая даёт основную часть результатов, а не распределять усилия равномерно.
   - context: Принцип 80/20 отвергает интуицию, что все действия одинаково важны для успеха; он переводит это в решение, где именно концентрировать усилия.
   - example: (empty)
   - source_quote: в том, что касается успеха, одинаково важно далеко не все
3. type: cloze
   - front: Согласно принципу Парето, небольшая доля {{c1::причин}} вызывает львиную долю последствий.
   - back: (empty)
   - context: Ключевая идея принципа 80/20: неравномерность связи между входами и результатами, на которой основаны приоритеты.
   - example: (empty)
   - source_quote: Небольшая доля причин вызывает львиную долю последствий

skipped_note: Пропущены общие рассуждения о «выдающихся результатах» и формулировка «однозначно указывает» как риторика; также не добавлял числа и примеры, которых нет в тексте.

### v2-level-aware

tokens: 1088 in, 1501 out; max_cards 3; cost $0.00086

1. type: basic
   - front: Как по принципу 80/20 распределять усилия, чтобы получить максимум результата?
   - back: Найти небольшую долю причин или усилий, которая дает большую часть результатов, и сосредоточиться на ней.
   - context: Принцип Парето описан в тексте как основа выбора, на что тратить время и ресурсы, а не как закон для всех ситуаций.
   - example: (empty)
   - source_quote: Небольшая доля причин вызывает львиную долю последствий.
2. type: basic
   - front: Какое ошибочное допущение опровергает принцип 80/20?
   - back: Что все причины, вложения и усилия одинаково важны для успеха.
   - context: Принцип 80/20 работает как инструмент неравного распределения внимания: он предполагает, что вклад факторов в результат неравномерен.
   - example: (empty)
   - source_quote: в том, что касается успеха, одинаково важно далеко не все
3. type: basic
   - front: Как автор описывает соотношение между объемом усилий и результатом по Парето?
   - back: По мнению автора, максимум желаемого дает минимум делаемого: выдающиеся результаты являются плодами несоразмерно малых усилий.
   - context: Это сильная формулировка автора («однозначно указывает»), которую в тексте не подкрепляют данными; её стоит считать его позицией.
   - example: (empty)
   - source_quote: максимум того, чего вы хотите, будет являться результатом минимума того, что вы делаете

skipped_note: Текст очень короткий и в основном повторяет одну идею: неравномерность вклада причин в результат. Вводные определения (что такое 80/20) пропущены как базовые для уровня 2. В тексте нет способа выявить «решающее меньшинство», нет примеров применения, границ применимости и критики принципа, поэтому карточки по уровню 3 (когда не использовать, ограничения) создать нельзя. Числа 80 и 20 как эмпирические оценки в тексте не обоснованы, поэтому на них карточки не строились.

### v3-self-filter

tokens: 1142 in, 1552 out; max_cards 3; cost $0.00089

1. type: basic
   - front: Что утверждает принцип 80/20 о соотношении причин и результатов?
   - back: Небольшая доля причин, вложенных средств или усилий создаёт большую долю результатов и вознаграждения.
   - context: Принцип 80/20 (Парето) описывает неравномерность: несколько входных факторов определяют большую часть итогов.
   - example: (empty)
   - source_quote: небольшая доля причин, вкладываемых средств или прилагаемых усилий отвечает за большую долю результатов
2. type: basic
   - front: Как принцип 80/20 советует относиться к тому, какие действия выбрать для достижения успеха?
   - back: Не всё одинаково важно для успеха: почти все результаты дает избранная часть усилий, и её нужно выделять.
   - context: По мнению автора, из множества возможных действий следует отбирать те, что дают основную долю результата, а не распределять усилия равномерно.
   - example: (empty)
   - source_quote: Почти все результаты обеспечиваются избранной частью усилий

skipped_note: (empty)

dropped_ideas:
- Максимум желаемых результатов получается из минимума действий (Повторяет основной принцип другими словами)
- Выдающиеся результаты требуют несоразмерно малых усилий, в отличие от представлений большинства (Дублирует идею избранной части усилий)
- Парето однозначно указывает на принцип (Ссылка на источник, а не применимая идея)

### v4-patterns

tokens: 1129 in, 2147 out; max_cards 3; cost $0.00119

1. type: basic
   - front: В каких ситуациях применять принцип Парето 80/20 к своей работе?
   - back: Когда, по мнению автора принципа, небольшая доля причин, вложений или усилий даёт львиную долю результатов.
   - context: Принцип Парето 80/20 задаёт рамку для выбора, на что тратить усилия в первую очередь, исходя из того, что результаты распределены неравномерно.
   - example: (empty)
   - pattern: when_to_use
   - source_quote: Небольшая доля причин вызывает львиную долю последствий.
2. type: basic
   - front: Какую ошибку в распределении усилий описывает принцип Парето 80/20 и как её исправить?
   - back: Ошибка: считать, что все усилия одинаково важны. Исправление: выделить избранную часть усилий, дающую основной результат.
   - context: Принцип Парето 80/20 утверждает, что вклады в результат сильно неравны, поэтому равномерное распределение времени и сил по всем задачам менее эффективно.
   - example: (empty)
   - pattern: mistake_fix
   - source_quote: в том, что касается успеха, одинаково важно далеко не все
3. type: basic
   - front: Чем, по принципу Парето 80/20, выдающиеся результаты отличаются от представлений большинства?
   - back: По принципу Парето, выдающиеся результаты являются плодами несоразмерно малого количества усилий, а не большого.
   - context: Автор противопоставляет этот взгляд распространённым представлениям большинства о том, что успех требует пропорционально большого труда.
   - example: (empty)
   - pattern: difference
   - source_quote: выдающиеся результаты являются плодами несоразмерно малого количества усилий

skipped_note: Текст состоит в основном из одного принципа, повторённого разными словами. Формулировку «максимум того, чего вы хотите, будет являться результатом минимума того, что вы делаете» я не сделала отдельной карточкой, так как она почти дублирует карточку о выборе ключевой части усилий. Отдельной карточки-определения не сделано, так как идея применима без точного определения.

### Existing app cards (first 5 of 6 bits)

- statement: Небольшая доля причин, вложенных средств или усилий часто определяет большую долю результатов. Поэтому далеко не все факторы успеха одинаково важны.
  - [wh_question] Почему далеко не все факторы успеха одинаково важны? -> Потому что небольшая доля причин, вложенных средств или усилий часто определяет большую долю результатов.
- statement: Максимум желаемого обычно достигается минимумом правильно выбранных действий, поэтому усилия стоит концентрировать на небольшой части дел, дающих наибольшую отдачу.
  - [wh_question] Почему стоит концентрировать усилия на небольшой части дел, дающих наибольшую отдачу? -> Потому что максимум желаемого обычно достигается минимумом правильно выбранных действий.
- statement: Небольшая доля причин, усилий или вложенных средств обычно даёт большую часть результатов, поэтому ресурсы стоит концентрировать на этой части.
  - [wh_question] Почему ресурсы стоит концентрировать на небольшой доле причин, усилий или вложенных средств? -> Потому что эта небольшая доля обычно даёт большую часть результатов.
- statement: Желаемый результат обычно достигается небольшим числом правильно выбранных действий, а не их большим количеством.
  - [basic] Что обычно требуется для достижения желаемого результата: большое или небольшое число правильно выбранных действий? -> Небольшое число правильно выбранных действий.
- statement: Небольшая доля причин, вложенных средств или усилий обычно даёт большую долю результатов, поэтому не все факторы успеха одинаково важны.
  - [fill_in_the_blank] Небольшая доля причин, вложенных средств или усилий обычно даёт большую долю ____. -> результатов
  - [wh_question] Почему не все факторы успеха одинаково важны? -> Потому что небольшая доля причин, вложенных средств или усилий обычно даёт большую долю результатов.

## Source 3: (unfiled)

- id: ks_582b0e4f-f527-436c-a6e9-3821e18f2d1d, url: https://temporal.io/blog/what-is-durable-execution
- words sent: 49 of 49; output language given: English; max cards: 3
- excerpt: "Page: The definitive guide to Durable Execution | Temporal Durable Execution is crash-proof execution. It enables developers to write reliable software with less effort. It lets them focus on what the application should achieve instead of anticipating and trying to handle everything that might go ..."

### starter

tokens: 947 in, 805 out; max_cards 3; cost $0.00050

1. type: basic
   - front: According to Temporal, what is durable execution?
   - back: Crash-proof execution that helps developers write reliable software with less effort.
   - context: Temporal's definition of durable execution, the core idea behind the guide. It is the vendor's framing, so attribute it to Temporal rather than treating it as a universal definition.
   - example: (empty)
   - source_quote: Durable Execution is crash-proof execution. It enables developers to write reliable software with less effort.
2. type: basic
   - front: According to Temporal, what can developers focus on when using durable execution, instead of anticipating and handling every possible failure?
   - back: What the application should achieve.
   - context: Durable execution shifts developer effort from failure handling to application goals. This is the practical benefit that follows from the crash-proof definition.
   - example: (empty)
   - source_quote: It lets them focus on what the application should achieve instead of anticipating and trying to handle everything that might go wrong

skipped_note: Source is a short intro with only one definition and one benefit; no frameworks, numbers, or mechanisms to build further cards on without adding facts not in the text.

### v2-level-aware

tokens: 961 in, 1283 out; max_cards 3; cost $0.00074

1. type: basic
   - front: According to the source, what should a developer focus on when using durable execution, rather than on handling failures?
   - back: What the application should achieve, instead of anticipating and handling everything that might go wrong along the way.
   - context: The source presents durable execution as a way to shift developer effort from failure-handling logic to the application's goal.
   - example: (empty)
   - source_quote: instead of anticipating and trying to handle everything that might go wrong
2. type: basic
   - front: According to the source, what is the practical benefit of durable execution for building reliable software?
   - back: It lets developers write reliable software with less effort.
   - context: The source frames this as the reason to use durable execution, but gives no evidence or comparison with other approaches.
   - example: (empty)
   - source_quote: It enables developers to write reliable software with less effort.

skipped_note: The source is a single short introductory paragraph. It gives only a definition (crash-proof execution) and a general claim of less effort and a goal-first focus, with no steps, examples, numbers, or limits. Level 2 cards on when to use the idea, common mistakes, or comparison with other approaches cannot be made from this text without adding facts, so I produced only 2 cards. The source's claims are promotional and unsupported, so application-level and trade-off cards would need a fuller source.

### v3-self-filter

tokens: 1015 in, 1296 out; max_cards 3; cost $0.00075

1. type: basic
   - front: What is Durable Execution?
   - back: Crash-proof execution: a way of running software so that crashes do not stop it from completing its work.
   - context: Durable Execution is presented as the core concept behind writing reliable software. The source defines it in one line, so the card keeps the definition close to the source.
   - example: (empty)
   - source_quote: Durable Execution is crash-proof execution.
2. type: basic
   - front: When building software with Durable Execution, where should a developer direct most of their effort?
   - back: Toward what the application should achieve, rather than anticipating and handling every failure that might occur along the way.
   - context: The author's view is that Durable Execution lets developers stop designing around every possible failure and concentrate on the application's goal instead.
   - example: (empty)
   - source_quote: It lets them focus on what the application should achieve instead of anticipating and trying to handle everything that might go wrong along the way.

skipped_note: (empty)

dropped_ideas:
- Durable Execution enables reliable software with less effort (Restates the benefit already covered by the focus-shift card)
- Page title: The definitive guide to Durable Execution (Navigational label, not an applicable idea)

### v4-patterns

tokens: 1002 in, 1193 out; max_cards 3; cost $0.00070

1. type: basic
   - front: In Temporal's guide to Durable Execution, what does 'Durable Execution' mean?
   - back: Crash-proof execution: developers write reliable software with less effort and focus on what the application should achieve.
   - context: This is a software-engineering concept from Temporal's guide, not a business framework. The source gives only this short description.
   - example: (empty)
   - pattern: definition
   - source_quote: Durable Execution is crash-proof execution.

skipped_note: The source is a short software-engineering introduction, not business reading. It names no steps, situations where the idea fails, comparisons, signals, or mistakes, so those patterns had no supported content. The one card is a definition, which the source's brief contrast does not rule out. The line about developers not having to anticipate and handle every possible failure was left out because it would need an interpretive 'difference' card with no named comparison idea in the text.

### Existing app cards (4 of 4 bits)

- statement: Durable Execution makes software crash-proof, so developers can write reliable applications with less effort.
  - [wh_question] Why can developers write reliable applications with less effort when they use Durable Execution? -> Because Durable Execution makes software crash-proof.
- statement: With durable execution, developers can focus on what an application should achieve instead of anticipating and handling every failure that might occur along the way.
  - [basic] When using durable execution, what can developers focus on instead of anticipating and handling every possible failure? -> What the application should achieve.
- statement: Durable Execution lets developers write reliable software with less effort, because the runtime keeps execution going through failures instead of requiring every possible failure to be anticipated and handled in application code.
  - [fill_in_the_blank] Durable Execution lets developers write reliable software with less effort, because the runtime keeps execution going through ____ instead of requiring every possible failure to be anticipated and handled in application code. -> failures
  - [wh_question] Why can developers write reliable software with less effort when they use Durable Execution? -> Because the runtime keeps execution going through failures instead of requiring every possible failure to be anticipated and handled in application code.
- statement: When using Durable Execution, developers can focus on what the application should achieve rather than on anticipating and handling everything that might go wrong.
  - [basic] When using Durable Execution, what can developers focus on instead of anticipating and handling everything that might go wrong? -> What the application should achieve.

## Facts observed

All statements below are read from the tables and cards above (Fact).

- Only 3 knowledge sources exist in the local dev database; only 1 is under Business (Business > Common, 120 words, Russian, personal anecdote). The other 2 have no subject: a 77-word Russian text on the 80/20 principle and a 49-word English Temporal page on durable execution. No source reached 500 words, so max_cards was 3 everywhere and no source was cut.
- 12 calls ran (4 prompt versions x 3 sources); 12/12 parsed as JSON and passed the Zod shape check; 0 call failures, 0 retries. 3 of 12 responses were wrapped in a ```json fence (starter on source 3, v3 on source 3, v4 on source 2); the plain-JSON parse failed for those and the one-time fence strip succeeded.
- Card counts vs max_cards 3: no response exceeded 3. Totals: starter 6, v2 5, v3 6, v4 4. On the Business source, starter produced 1 card, v3 produced 2, v2 and v4 produced 0 and explained in skipped_note that the text is a personal story with no applicable framework.
- Every produced card (21 of 21) had a source_quote found verbatim in the source text after whitespace and case normalisation; 0 non-verbatim quotes.
- Output language matched the source language in every response (Russian for sources 1 and 2, English for source 3).
- Cloze: only the starter produced a cloze card (1, on the 80/20 source); it had exactly one {{c1::...}} and an empty back, as the prompt asks. v2, v3 and v4 produced 0 cloze cards.
- Meta-word fronts (fronts containing words such as "the author", "the source", "автор"): starter 1, v2 3, v3 1, v4 0. The matched fronts are of the form "According to the source, ..." or "Согласно автору, ...", which is the attribution form principle 4 asks for.
- Average back length in words: starter 10.3, v2 13.4, v3 17.5, v4 15.3 (the prompts ask for max ~25 words).
- v3: dropped_ideas was present in all 3 responses, 9 dropped ideas in total (4, 3, 2 per source); skipped_note was empty in all 3.
- v4: pattern distribution over its 4 cards was when_to_use 1, mistake_fix 1, difference 1, definition 1; so 1 definition card out of 4 (on the Temporal source).
- v2: the known-concepts list was empty for every source (no other knowledge source exists in the same subject, and the two unfiled sources have no subject), so the prompt received "(none)" and the repeat count against known fronts is 0 by construction, not by observation.
- v2 skipped_note on the Business source says the material does not fit level 2; v4 skipped_note on the Temporal source says it is software, not business reading.
- Existing app cards for the same sources are statement-based (wh_question, basic, fill_in_the_blank variants). The Business source has 10 existing bits including "Какие оценки я получал в школе?"; the prompt versions produced 0-2 cards for the same text. Only the first 5 bits per source are listed above.
- Cost: total $0.00872 for all 12 calls; per-version totals are in the Totals table. One run per prompt and source, so no variance between repeated runs was measured.
