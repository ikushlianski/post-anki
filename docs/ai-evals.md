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

## Cheap model comparison

- date: 2026-10-25
- same 3 sources, same 4 unedited prompt files, one call per source per version, single user message, default sampling, via OpenRouter; baseline rows are the earlier anthropic/claude-haiku-5.5 run (not re-run)
- prices per million tokens (in/out), checked against the live OpenRouter models list: openai/gpt-oss-20b 0.018/0.09; qwen/qwen3.7-flash 0.03/0.13; deepseek/deepseek-v4-flash-0731 0.04444/0.13332; mistralai/mistral-nemo 0.029/0.03; ~z-ai/glm-flash-latest 0.0175/0.1425; anthropic/claude-haiku-5.5 0.1/0.5
- cost = returned token usage x list price; a model that returns reasoning tokens is billed for them if the provider counts them in output usage
- wrong lang = cards whose front+back is not in the language the prompt asked for (Cyrillic share under 50% for Russian, over 10% for English)

### Per model and prompt version (3 calls each)

| Model | Version | Cards | JSON ok | Fence needed | Quotes verbatim | Avg back words | Cost | Failed calls | Calls over max_cards | Wrong-lang cards |
|---|---|---|---|---|---|---|---|---|---|---|
| anthropic/claude-haiku-5.5 (baseline) | starter | 6 | 3/3 | 1 | 6/6 | 10.3 | $0.00191 | 0 | 0 | 0 |
| anthropic/claude-haiku-5.5 (baseline) | v2-level-aware | 5 | 3/3 | 0 | 5/5 | 13.4 | $0.00197 | 0 | 0 | 0 |
| anthropic/claude-haiku-5.5 (baseline) | v3-self-filter | 6 | 3/3 | 1 | 6/6 | 17.5 | $0.00262 | 0 | 0 | 0 |
| anthropic/claude-haiku-5.5 (baseline) | v4-patterns | 4 | 3/3 | 1 | 4/4 | 15.3 | $0.00222 | 0 | 0 | 0 |
| openai/gpt-oss-20b | starter | 9 | 3/3 | 0 | 7/9 | 7.8 | $0.00036 | 0 | 0 | 0 |
| openai/gpt-oss-20b | v2-level-aware | 9 | 3/3 | 0 | 6/9 | 12.0 | $0.00032 | 0 | 0 | 0 |
| openai/gpt-oss-20b | v3-self-filter | 8 | 3/3 | 0 | 8/8 | 11.5 | $0.00063 | 0 | 0 | 0 |
| openai/gpt-oss-20b | v4-patterns | 8 | 3/3 | 0 | 4/8 | 10.0 | $0.00074 | 0 | 0 | 0 |
| qwen/qwen3.7-flash | starter | 9 | 3/3 | 0 | 5/9 | 11.6 | $0.00143 | 0 | 0 | 0 |
| qwen/qwen3.7-flash | v2-level-aware | 8 | 3/3 | 0 | 6/8 | 12.4 | $0.00126 | 0 | 0 | 0 |
| qwen/qwen3.7-flash | v3-self-filter | 5 | 3/3 | 0 | 5/5 | 13.0 | $0.00200 | 0 | 0 | 0 |
| qwen/qwen3.7-flash | v4-patterns | 5 | 3/3 | 0 | 5/5 | 14.2 | $0.00131 | 0 | 0 | 0 |
| deepseek/deepseek-v4-flash-0731 | starter | 8 | 3/3 | 0 | 8/8 | 8.4 | $0.00251 | 0 | 0 | 0 |
| deepseek/deepseek-v4-flash-0731 | v2-level-aware | 7 | 3/3 | 0 | 7/7 | 10.7 | $0.00335 | 0 | 0 | 0 |
| deepseek/deepseek-v4-flash-0731 | v3-self-filter | 6 | 3/3 | 0 | 6/6 | 11.7 | $0.00410 | 0 | 0 | 0 |
| deepseek/deepseek-v4-flash-0731 | v4-patterns | 8 | 3/3 | 0 | 8/8 | 17.4 | $0.00749 | 0 | 0 | 0 |
| mistralai/mistral-nemo | starter | 7 | 3/3 | 0 | 7/7 | 4.4 | $0.00010 | 0 | 0 | 0 |
| mistralai/mistral-nemo | v2-level-aware | 7 | 3/3 | 0 | 4/7 | 9.3 | $0.00009 | 0 | 0 | 0 |
| mistralai/mistral-nemo | v3-self-filter | 5 | 3/3 | 0 | 5/5 | 8.6 | $0.00009 | 0 | 0 | 0 |
| mistralai/mistral-nemo | v4-patterns | 6 | 3/3 | 0 | 1/6 | 13.0 | $0.00010 | 0 | 0 | 0 |
| ~z-ai/glm-flash-latest | starter | 7 | 3/3 | 2 | 6/7 | 10.6 | $0.00034 | 0 | 0 | 0 |
| ~z-ai/glm-flash-latest | v2-level-aware | 8 | 3/3 | 1 | 8/8 | 12.6 | $0.00043 | 0 | 0 | 0 |
| ~z-ai/glm-flash-latest | v3-self-filter | 5 | 3/3 | 2 | 4/5 | 14.4 | $0.00047 | 0 | 0 | 0 |
| ~z-ai/glm-flash-latest | v4-patterns | 8 | 3/3 | 2 | 8/8 | 14.5 | $0.00059 | 0 | 0 | 0 |

### Estimated cost per 1000 sources

Assumption: 1000 sources each like these 3 (49-120 words), one call each with the given prompt version, the mean measured cost per successful call here, no retries, no longer sources.

| Model | starter | v2-level-aware | v3-self-filter | v4-patterns |
|---|---|---|---|---|
| anthropic/claude-haiku-5.5 (baseline) | $0.64 | $0.66 | $0.87 | $0.74 |
| openai/gpt-oss-20b | $0.12 | $0.11 | $0.21 | $0.25 |
| qwen/qwen3.7-flash | $0.48 | $0.42 | $0.67 | $0.44 |
| deepseek/deepseek-v4-flash-0731 | $0.84 | $1.12 | $1.37 | $2.50 |
| mistralai/mistral-nemo | $0.03 | $0.03 | $0.03 | $0.03 |
| ~z-ai/glm-flash-latest | $0.11 | $0.14 | $0.16 | $0.20 |

### Cards for the patterns prompt, per model (front -> back; context, example and quote omitted, see results.json)

#### Source 1: Business > Common (120 words)

##### openai/gpt-oss-20b

881 in / 3471 out tokens, 3 card(s)

1. [when_to_use] Когда стоит использовать идею превращения частых ошибок в экспертизу? -> Когда вы часто делаете ошибки и хотите использовать их как источник экспертизы.
2. [when_to_use] Когда стоит использовать предпринимательство для тех, кто не любит подчиняться? -> Когда вы не любите следовать приказам и предпочитаете экспериментировать. **[quote not verbatim]**
3. [difference] Как отличается предпринимательство от работы по приказу для тех, кто не любит подчиняться? -> Предпринимательство позволяет экспериментировать и делать всё по-своему, тогда как работа по приказу ограничивает свободу. **[quote not verbatim]**

##### qwen/qwen3.7-flash

878 in / 1480 out tokens, 0 card(s); skipped_note: Исходный текст содержит лишь личный анекдот и субъективное рассуждение без описания рабочих методик, сигналов, этапов или сравнений. Он не предоставляет применимых на практике бизнес-идей, поэтому пропущен согласно правилу 4.


##### deepseek/deepseek-v4-flash-0731

944 in / 21217 out tokens, 2 card(s)

1. [when_to_use] В каком случае, по мнению предпринимателя-рассказчика, человеку больше подходит предпринимательство, чем наёмная работа? -> Когда он не любит подчиняться приказам и хочет экспериментировать, делая всё по-своему.
2. [why_it_works] Почему, по логике предпринимателя-рассказчика, частые ошибки могут стать основой экспертизы? -> Частая практика делает человека опытнее в том, что он повторяет; поэтому он может знать об ошибках больше других.

##### mistralai/mistral-nemo

858 in / 425 out tokens, 2 card(s)

1. [why_it_works] Почему часто делая ошибки можно стать экспертом в их исправлении? -> Такой человек научается находить и исправлять ошибки лучше, чем тот, кто редко ошибается. **[quote not verbatim]**
2. [difference] В чем разница между академической успешностью и предпринимательством? -> Академическая успешность фокусируется на знаниях и послужном списке, в то время как предпринимательство ценит способность к экспериментам и самостоятельности. **[quote not verbatim]**

##### ~z-ai/glm-flash-latest

858 in / 1103 out tokens, 2 card(s)

1. [signal] По каким признакам человек может понять, что предпринимательство подходит ему больше, чем наемная работа? -> Мнение автора: нелюбовь подчиняться приказам, любовь к экспериментам и делать всё по-своему.
2. [difference] Чем путь предпринимателя отличается от пути наемного работника (по мнению автора)? -> Предприниматель экспериментирует и действует по-своему; наемный работник подчиняется приказам и продвигается по чужим правилам.


#### Source 2: (unfiled) (77 words)

##### openai/gpt-oss-20b

836 in / 2163 out tokens, 3 card(s)

1. [definition] Принцип 80/20 гласит, что небольшая доля причин отвечает за большую долю результатов. -> Минимум того, чего вы хотите, приводит к максимуму результата. **[quote not verbatim]**
2. [when_to_use] Принцип 80/20 применяется, когда нужно сосредоточить усилия на том, что приносит максимум результата. -> Фокус на избранной части усилий обеспечивает большую часть результатов.
3. [why_it_works] Почему принцип 80/20 работает? -> Почти все результаты обеспечиваются избранной частью усилий.

##### qwen/qwen3.7-flash

807 in / 4839 out tokens, 3 card(s)

1. [signal] По какому признаку можно выявить те усилия, которые действительно ведут к выдающимся результатам? -> Если малая часть ваших действий или затрат систематически приносит основную долю отдаче и доходов.
2. [why_it_works] Почему концентрация на ограниченном наборе задач даёт непропорционально высокий результат? -> Потому что незначительная часть причин и действий порождает преимущественную долю последствий, а не равноценный вклад.
3. [when_to_use] При какой ситуации следует применять максимизацию результата через минимальное количество действий? -> Когда цель состоит в получении максимального желаемого эффекта без пропорционального увеличения затрачиваемых усилий.

##### deepseek/deepseek-v4-flash-0731

879 in / 12039 out tokens, 3 card(s)

1. [why_it_works] Почему принцип Парето (80/20) оправдывает концентрацию на небольшой части усилий? -> По принципу Парето, почти все результаты обеспечиваются избранной частью усилий, поэтому максимум желаемого достигается минимумом действий.
2. [mistake_fix] Какое распространённое заблуждение о выдающихся результатах противоречит принципу Парето, и что из этого следует? -> Принцип Парето утверждает: в противоположность мнению большинства, выдающиеся результаты даёт несоразмерно малая доля усилий. Максимум желаемого — результат минимума действий.
3. [difference] Чем принцип Парето отличается от мнения, что для успеха одинаково важны все усилия? -> Он утверждает: одинаково важно далеко не всё; небольшая доля причин вызывает львиную долю последствий.

##### mistralai/mistral-nemo

817 in / 449 out tokens, 2 card(s)

1. [when_to_use] Применяйте принцип Парето, когда хотите достичь выдающихся результатов с минимальными усилиями. -> Используйте 20% усилий для достижения 80% результатов. **[quote not verbatim]**
2. [when_not] Не используйте принцип Парето, когда все усилия важны для достижения результатов. -> Если каждая задача имеет равное значение, принцип Парето не поможет.

##### ~z-ai/glm-flash-latest

798 in / 1448 out tokens, 3 card(s)

1. [definition] В чём суть принципа 80/20 (принципа Парето)? -> Небольшая доля причин, вложенных средств и усилий отвечает за большую долю результатов и вознаграждения.
2. [mistake_fix] Какая распространённая ошибка мешает достичь выдающихся результатов, и в чём её исправление? -> Ошибка: считать все усилия одинаково важными. Исправление: выявить малую долю причин, дающую львиную долю результатов, и сосредоточиться на ней.
3. [when_to_use] Когда стоит применять принцип 80/20 на работе? -> Когда нужно получить максимум желаемого: поиск малого набора действий и причин, который даёт основную часть результата.

### Facts observed (cheap models)

All statements are read from the tables above and from results.json (Fact). One run per model, prompt version and source; no variance between repeated runs was measured.

- 60 new calls ran (5 models x 4 versions x 3 sources); 60/60 returned parseable JSON that passed the shape check; 0 call failures, 0 retries recorded. No model failed JSON.
- Fenced replies (```json) that needed the fence strip: ~z-ai/glm-flash-latest 7 of 12; the Haiku 5.5 baseline 3 of 12; none for gpt-oss-20b, qwen3.7-flash, deepseek-v4-flash-0731 or mistral-nemo.
- Quotes not found verbatim in the source (after whitespace and case normalisation), cards affected / cards total: gpt-oss-20b 9/34, qwen3.7-flash 6/27, mistral-nemo 8/25, glm-flash 2/28, deepseek-v4-flash 0/29, Haiku 5.5 baseline 0/21. mistral-nemo with the patterns prompt: 5 of 6 cards not verbatim; gpt-oss-20b with the patterns prompt: 4 of 8.
- Cards over the per-source max_cards: 0 calls for every model; no model ignored the card count. Haiku 5.5 returned 0 cards for the Business anecdote with two prompt versions; of the cheap models only qwen3.7-flash with the patterns prompt returned 0 cards (Business anecdote); every other cheap-model call returned cards (card totals per model and version are in the first table).
- Wrong output language (Cyrillic check on front and back): 0 cards for every model.
- Average output tokens per call: gpt-oss-20b 1746, qwen3.7-flash 3665, deepseek-v4-flash 10632, mistral-nemo 337, glm-flash 979. Average input tokens were 766-839 for all five. Returned output usage for the first three is far larger than the visible JSON, which is consistent with reasoning tokens being counted (Assumption: not verified in the provider's response).
- Measured cost of the 12 calls: gpt-oss-20b $0.00206, qwen3.7-flash $0.00600, deepseek-v4-flash $0.01746, mistral-nemo $0.00039, glm-flash $0.00183 (Haiku 5.5 baseline $0.00872). Because of the output volume, deepseek-v4-flash is the most expensive model per call here, above Haiku 5.5 with the patterns prompt ($2.50 vs $0.74 per 1000 sources), despite the lowest-tier list price per token.
- Average back length (words) ranges from 4.4 (mistral-nemo, starter) to 17.5 (Haiku 5.5, v3); the prompts ask for at most about 25.

## AI judge

- date: 2026-10-25
- judge: anthropic/claude-haiku-5.5 via OpenRouter, default sampling, prompts in apps/api/scripts/eval-business-cards/judge-prompts.ts
- judge calls: 121 single-card scorings, 24 set rankings; failed calls: 0; tokens 188363 in, 119432 out; judge cost $0.07855
- persona: a working professional learning business who reviews the cards as spaced-repetition flashcards; criteria and 1/3/5 anchors are in the judge prompt file
- sources judged: the two business sources only (the Business > Common anecdote and the 80/20 text); the English Temporal source is not judged
- 'existing' = the app pipeline's cards already stored for the source (first 5 bits, first question variant of each, as listed under Existing app cards); it is scored as cards and enters each ranking as a 5th anonymous set
- card scoring is blind: the judge sees the source text and one card, with no prompt version or model name; set ranking shows the sets under letters in a seeded order, the second pass uses the reverse order

### Mean scores per prompt version (1-5)

Pooled over all models

| Group | Cards judged | would_learn_something | can_apply | answerable_alone | single_clear_idea | faithful_to_source | not_trivial | overall | keep = yes |
|---|---|---|---|---|---|---|---|---|---|
| starter | 31 | 2.26 | 2.48 | 3.77 | 3.90 | 4.03 | 2.19 | 2.55 | 17/31 |
| v2-level-aware | 31 | 2.42 | 2.58 | 3.42 | 3.52 | 3.35 | 2.52 | 2.45 | 14/31 |
| v3-self-filter | 23 | 2.57 | 2.87 | 3.65 | 3.70 | 3.35 | 2.83 | 2.78 | 15/23 |
| v4-patterns | 26 | 2.54 | 3.04 | 3.69 | 3.62 | 3.38 | 2.62 | 2.69 | 15/26 |
| existing | 10 | 1.90 | 2.00 | 3.30 | 4.20 | 4.70 | 1.60 | 2.00 | 3/10 |

Per model

| Group | Cards judged | would_learn_something | can_apply | answerable_alone | single_clear_idea | faithful_to_source | not_trivial | overall | keep = yes |
|---|---|---|---|---|---|---|---|---|---|
| app-pipeline / existing | 10 | 1.90 | 2.00 | 3.30 | 4.20 | 4.70 | 1.60 | 2.00 | 3/10 |
| anthropic/claude-haiku-5.5 / starter | 4 | 2.25 | 3.00 | 4.25 | 4.00 | 4.25 | 2.50 | 3.00 | 3/4 |
| anthropic/claude-haiku-5.5 / v2-level-aware | 3 | 2.67 | 3.00 | 3.67 | 4.00 | 4.00 | 2.67 | 2.67 | 2/3 |
| anthropic/claude-haiku-5.5 / v3-self-filter | 4 | 2.50 | 3.00 | 4.00 | 3.75 | 3.75 | 2.75 | 3.00 | 3/4 |
| anthropic/claude-haiku-5.5 / v4-patterns | 3 | 2.67 | 3.33 | 3.67 | 3.33 | 4.00 | 2.33 | 2.67 | 2/3 |
| openai/gpt-oss-20b / starter | 6 | 2.17 | 2.17 | 3.83 | 3.83 | 3.83 | 2.17 | 2.67 | 4/6 |
| openai/gpt-oss-20b / v2-level-aware | 6 | 2.17 | 3.00 | 3.33 | 2.83 | 2.00 | 2.50 | 2.17 | 3/6 |
| openai/gpt-oss-20b / v3-self-filter | 5 | 2.60 | 2.60 | 3.60 | 4.00 | 3.60 | 2.60 | 2.60 | 3/5 |
| openai/gpt-oss-20b / v4-patterns | 6 | 2.17 | 2.67 | 3.50 | 3.50 | 2.67 | 2.50 | 2.17 | 1/6 |
| qwen/qwen3.7-flash / starter | 6 | 2.67 | 2.67 | 3.83 | 4.00 | 3.33 | 2.50 | 2.67 | 4/6 |
| qwen/qwen3.7-flash / v2-level-aware | 6 | 2.50 | 2.83 | 3.33 | 3.50 | 3.33 | 2.83 | 2.83 | 3/6 |
| qwen/qwen3.7-flash / v3-self-filter | 4 | 2.50 | 3.25 | 3.50 | 3.25 | 2.25 | 3.25 | 2.50 | 2/4 |
| qwen/qwen3.7-flash / v4-patterns | 3 | 3.00 | 3.67 | 3.33 | 3.67 | 3.00 | 3.00 | 2.67 | 2/3 |
| deepseek/deepseek-v4-flash-0731 / starter | 6 | 2.33 | 2.17 | 3.50 | 4.33 | 4.67 | 2.17 | 2.50 | 3/6 |
| deepseek/deepseek-v4-flash-0731 / v2-level-aware | 5 | 2.60 | 2.40 | 3.60 | 4.00 | 4.00 | 2.40 | 2.60 | 2/5 |
| deepseek/deepseek-v4-flash-0731 / v3-self-filter | 4 | 3.00 | 3.25 | 3.75 | 3.75 | 3.75 | 3.25 | 3.25 | 3/4 |
| deepseek/deepseek-v4-flash-0731 / v4-patterns | 5 | 2.60 | 3.00 | 3.80 | 3.80 | 4.00 | 2.80 | 3.00 | 3/5 |
| mistralai/mistral-nemo / starter | 5 | 1.80 | 2.20 | 3.40 | 3.60 | 4.20 | 1.60 | 2.00 | 1/5 |
| mistralai/mistral-nemo / v2-level-aware | 5 | 2.00 | 1.80 | 2.60 | 2.80 | 3.60 | 2.00 | 1.80 | 0/5 |
| mistralai/mistral-nemo / v3-self-filter | 3 | 2.33 | 2.33 | 3.00 | 3.67 | 3.33 | 2.67 | 2.67 | 2/3 |
| mistralai/mistral-nemo / v4-patterns | 4 | 2.50 | 2.75 | 4.00 | 3.75 | 2.75 | 2.50 | 2.75 | 3/4 |
| ~z-ai/glm-flash-latest / starter | 4 | 2.25 | 3.00 | 4.00 | 3.50 | 4.00 | 2.25 | 2.50 | 2/4 |
| ~z-ai/glm-flash-latest / v2-level-aware | 6 | 2.67 | 2.50 | 4.00 | 4.17 | 3.67 | 2.67 | 2.67 | 4/6 |
| ~z-ai/glm-flash-latest / v3-self-filter | 3 | 2.33 | 2.67 | 4.00 | 3.67 | 3.33 | 2.33 | 2.67 | 2/3 |
| ~z-ai/glm-flash-latest / v4-patterns | 5 | 2.60 | 3.20 | 3.80 | 3.60 | 4.00 | 2.60 | 3.00 | 4/5 |

### Set rankings (blind, per model and source, two orders each)

24 rankings parsed. Wins = times a version's set was ranked first; mean place 1 = best; the set from the app pipeline (version existing) is the 5th candidate; unacceptable = times it was named unacceptable.

| Version | Wins | Mean place | Named unacceptable |
|---|---|---|---|
| starter | 7 | 2.21 | 0 |
| v2-level-aware | 8 | 2.38 | 0 |
| v3-self-filter | 3 | 3.33 | 0 |
| v4-patterns | 4 | 3.50 | 2 |
| existing | 2 | 3.58 | 0 |

Agreement between the two order-swapped rankings (same model and source): identical full ranking 1/12; same first place 9/12.

### Lowest-scoring cards (max 10)

| Overall | Model | Version | Front | Judge reason |
|---|---|---|---|---|
| 1 | app-pipeline | existing | Почему я учился плохо в школе? | The card is faithful and clear but tests a biographical detail with no business value, so it is weak as a flashcard for this learner. |
| 1 | app-pipeline | existing | Какие оценки я получал в школе? | As a flashcard it tests a trivial biographical detail with no business value, so it would not help the learner. |
| 1 | app-pipeline | existing | Почему я мог бы стать экспертом в ошибках? | As a flashcard it offers no transferable business insight and mainly asks you to recall a personal anecdote. |
| 1 | app-pipeline | existing | Как я описываю себя в академическом смысле? | It is an accurate but purely biographical detail with no transferable business value, so it is not worth reviewing as a flashcard. |
| 1 | openai/gpt-oss-20b | v2-level-aware | Какой сигнал говорит о необходимости экспериментировать? | The card attributes a decision framework to a passage that does not contain one, so it would teach the learner something the source does not say. |
| 1 | openai/gpt-oss-20b | v2-level-aware | Какие ошибки чаще всего случаются при применении 80/20? | As a flashcard it asks about content the source does not contain, so it would teach me unsupported claims rather than what the text says about 80/20. |
| 1 | mistralai/mistral-nemo | starter | Почему автор плохо учился в школе? | As a flashcard for a business learner it tests a biographical anecdote with no transferable lesson, so it has little value in a deck. |
| 1 | mistralai/mistral-nemo | v2-level-aware | Автор предпочитает {{1::экспериментировать}} и делать все по-своему, а не {{1::следовать}} приказам | As a flashcard it has a mismatched front and back, a loose causal claim, and little practical value, so it would not help me learn or act. |
| 2 | app-pipeline | existing | Кем я стал в результате? | The card is accurate and clear enough, but it tests a biographical detail that offers little learning or practical value as a business flashcard. |
| 2 | app-pipeline | existing | Почему ресурсы стоит концентрировать на небольшой доле причин, усилий или вложенных средств? | It is a clear, accurate card but it recalls a familiar principle with little new insight, so it is only marginally worth keeping. |

### Judge limits

- The judge is Haiku 5.5, and the baseline cards were also written by Haiku 5.5 (possible self-preference).
- Only 2 short business sources were judged (77 and 120 words); one of them is a personal anecdote.
- The existing app cards are statement-based question variants and were reduced to one question per bit for judging; this changes their shape compared with the original set.
- Each card got one judge pass; the two ranking passes differ only in set order.
- The judge has not been calibrated against the owner's own ratings.

### Calibration sheet

12 cards from the business sources, anonymised and shuffled. Rate each 1-5 overall (1 = unusable, 5 = would keep as is) before looking at the lower table.

| Id | Source | Type | Front | Back | Context | Example | My rating (1-5) |
|---|---|---|---|---|---|---|---|
| C1 | 2 | basic | Как по принципу 80/20 распределять усилия, чтобы получить максимум результата? | Найти небольшую долю причин или усилий, которая дает большую часть результатов, и сосредоточиться на ней. | Принцип Парето описан в тексте как основа выбора, на что тратить время и ресурсы, а не как закон для всех ситуаций. |  | |
| C2 | 2 | basic | Какой принцип выбора приоритетов защищает от распыления сил в стратегическом планировании? | Отказаться от равномерного контроля всего, сфокусировав бюджет и внимание на критических факторах роста. | Автор предупреждает, что усреднённые усилия по всей площади бизнеса гарантируют лишь средний результат. |  | |
| C3 | 2 | basic | Какая стратегия действий ведет к максимуму желаемого результата по тексту? | Сделать минимум необходимых действий («минимум того, что вы делаете»), так как именно они формируют максимум. | Идеальное применение принципа: выявление критического меньшинства действий и работа только с ними. |  | |
| C4 | 2 | basic | Что обычно требуется для достижения желаемого результата: большое или небольшое число правильно выбранных действий? | Небольшое число правильно выбранных действий. |  |  | |
| C5 | 2 | basic | Согласно тексту, какое утверждение о выдающихся результатах противоположно представлению большинства? | Выдающиеся результаты являются плодами несоразмерно малого количества усилий. | Это контринтуитивная часть принципа 80/20: большинство склонно ожидать, что крупный результат требует крупных усилий. |  | |
| C6 | 2 | basic | Какая распространённая ошибка мешает достичь выдающихся результатов, и в чём её исправление? | Ошибка: считать все усилия одинаково важными. Исправление: выявить малую долю причин, дающую львиную долю результатов, и сосредоточиться на ней. | Принцип 80/20 переворачивает привычное представление о том, что успех требует пропорциональных усилий: почти всё обеспечивается избранной частью усилий. |  | |
| C7 | 2 | basic | Принцип 80/20 применяется, когда нужно сосредоточить усилия на том, что приносит максимум результата. | Фокус на избранной части усилий обеспечивает большую часть результатов. | Используя этот принцип, управляющие выделяют ключевые задачи для достижения цели. |  | |
| C8 | 1 | basic | Предпринимательство как альтернатива наемной работе | Автор выбрал предпринимательство из-за своей любви к экспериментам и нежеланию подчиняться приказам | Автор не подходил для высокооплачиваемой должности из-за своей нелюбви к подчинению |  | |
| C9 | 2 | basic | Руководитель считает, что результат пропорционален затраченным усилиям. Что принцип 80/20 говорит о таком ожидании? | Ожидание пропорциональности ошибочно: максимум желаемого достигается минимумом того, что вы делаете. | Это следствие принципа Парето для планирования: не масштабируйте усилия линейно, ищите точки несоразмерно высокой отдачи. |  | |
| C10 | 1 | basic | Как автор связывает отсутствие «академического ума» с пригодностью к предпринимательству? | По автору, академическая «умность» нужна для высокооплачиваемых должностей, но не для предпринимательского пути. | Оспариваемое личное мнение автора: успех в бизнесе он противопоставляет успеху в формальной иерархии, а не в учебе как таковой. | Автор говорит, что никто не взял бы его на высокооплачиваемую должность. | |
| C11 | 1 | basic | Согласно автору текста, почему предпринимательство подошло ему больше, чем работа по найму? | Он не любит подчиняться приказам и предпочитает экспериментировать и делать всё по-своему. | Автор объясняет свой карьерный выбор личной склонностью к автономии, а не академическими успехами: предпринимательство даёт свободу действий, которой нет у наёмного работника. |  | |
| C12 | 2 | basic | Не используйте принцип Парето, когда все усилия важны для достижения результатов. | Если каждая задача имеет равное значение, принцип Парето не поможет. | Принцип Парето неэффективен, когда все усилия одинаково важны. | При уборке офиса, каждый участок требует равного внимания. | |

Judge scores and origin for the sheet above (look only after rating).

| Id | Model | Version | Judge overall |
|---|---|---|---|
| C1 | anthropic/claude-haiku-5.5 | v2-level-aware | 3 |
| C2 | qwen/qwen3.7-flash | v3-self-filter | 3 |
| C3 | qwen/qwen3.7-flash | v2-level-aware | 3 |
| C4 | app-pipeline | existing | 3 |
| C5 | deepseek/deepseek-v4-flash-0731 | v2-level-aware | 2 |
| C6 | ~z-ai/glm-flash-latest | v4-patterns | 4 |
| C7 | openai/gpt-oss-20b | v4-patterns | 3 |
| C8 | mistralai/mistral-nemo | v3-self-filter | 2 |
| C9 | deepseek/deepseek-v4-flash-0731 | v3-self-filter | 4 |
| C10 | ~z-ai/glm-flash-latest | v2-level-aware | 3 |
| C11 | ~z-ai/glm-flash-latest | starter | 2 |
| C12 | mistralai/mistral-nemo | v4-patterns | 3 |

### Facts observed (judge)

All statements are read from the tables above and from judge.json (Fact). One judge pass per card, two ranking passes per model and source.

- 145 judge calls ran (121 card scorings, 24 set rankings); 0 failures, 0 retries; judge cost $0.07855 (188363 in, 119432 out tokens).
- Pooled mean overall score: existing app cards 2.00 (3 of 10 marked keep), starter 2.55, v2 2.45, v3 2.78, v4 2.69. By writer model (all versions): Haiku 5.5 2.86, deepseek-v4-flash 2.80, glm-flash 2.72, qwen3.7-flash 2.68, gpt-oss-20b 2.39, mistral-nemo 2.24. Differences between neighbouring values are 0.1-0.3 on a 1-5 scale with 10-23 cards per group.
- The existing app cards scored lowest on would_learn_something (1.90), can_apply (2.00) and not_trivial (1.60), and highest on faithful_to_source (4.70) and single_clear_idea (4.20). 6 of the 10 lowest-scoring cards are existing app cards (4 with overall 1 and 2 with overall 2; the judge's reasons name biographical detail or a familiar principle).
- Lowest faithful_to_source group means: gpt-oss-20b v2-level-aware 2.00, qwen3.7-flash v3-self-filter 2.25. The judge gave overall 1 to two gpt-oss-20b v2-level-aware cards because they state things the source does not contain.
- First places in the 24 rankings: starter 7, v2-level-aware 8, v3-self-filter 3, v4-patterns 4, existing 2. On the 80/20 source: starter 5, v2 3, v4 4, none for v3 or existing. On the anecdote source: v2 5, v3 3, starter 2, existing 2. Last places: v3 7, v4 7, existing 6, v2 3, starter 1.
- The only 'unacceptable' labels: qwen3.7-flash v4-patterns on the anecdote source, in both order-swapped passes.
- Order-swapped agreement: identical full ranking in 1 of 12 model-source pairs; same first place in 9 of 12. Mean place is therefore sensitive to set order for places 2-5.
- Distribution of the 121 overall scores: 1 x8, 2 x47, 3 x57, 4 x9, 5 x0.
- Total spend for this task: cheap-model runs $0.02774 plus judge $0.07855 = $0.10629 (the Haiku 5.5 baseline run of $0.00872 was already spent earlier).
