# THOUGHTS.md — Project Manager Learning Log

## Compacted History (batches 1–66, compacted 2026-04-17 iteration 69)

### Decisions made (permanent)

1. **Phase 1 = conversation loop only** — no concept hierarchy, no quiz mode, no browser extension, no dashboard. Daily push → Socratic chat → gap logging. Smallest thing that isn't Anki.
2. **Phase gate enforcement** — Phase 2 only after Phase 1 proven used for 4+ weeks. Written into Epic dependency chain.
3. **No concept hierarchy in Phase 1** — gaps stored as free-form topic strings tied to tool name. Rich model is Phase 1b.
4. **Auto-push is core mechanic** — zero browser extension/manual entry in Phase 1. AI reads docs from URL user provides once.
5. **Silent on non-response** — no guilt messages, no follow-up nudges, no streak tracking. Hard constraint across all phases.
6. **Single AI model tier in Phase 1** — one smart model for everything. Local model optimization is Phase 2.
7. **Doc ingestion = ~10 concept groups per tool** — filtered for architecture/reasoning content. No trivia, no API parameter names.
8. **Priority drift rule** — a prerequisite story must ALWAYS be at least as urgent as its most urgent dependent. Applied in batch 3: #15 and #16 upgraded from high → urgent.
9. **"Dismissed" in #29 IS the gap override** — user vetoes AI's gap assessment by dismissing. Not a separate story.
10. **Depth adaptation is its own story (#42)** — "the system I use in month 3 is harder than week 1" is a distinct user outcome.
11. **Over-granularity rule** — design constraints (like 3-line summary) are acceptance criteria, not stories. #32 closed into #27.
12. **#14 title rewritten** — "AI model connects to official tool docs" → "Discussions are grounded in the tool's real docs". Template for future rewrites.
13. **#38 created** — first-run setup was missing from backlog. Implementing agents need to know what /start does.
14. **Mac Mini deployment (#40) and observability (#41)** — essential for self-hosted personal project. A single-user system with no ops team MUST self-notify when it breaks.
15. **#18 depends on #31 and #35** — onboarding positions a tool using distilled knowledge. Cannot run before doc distillation exists or before tool is registered.
16. **Intensity override belongs in #25** — "test me hard on X" is a form of steering, not a separate story.
17. **/update command in #16** — docs URL update + re-distillation trigger for major version bumps. Prevents system from teaching stale patterns indefinitely.
18. **Telegram 4096-char limit** — noted in #27. The 3-line summary constraint already mitigates this, but implementing agents should know the reason.
19. **#42 depends on #35** — depth adaptation uses concept groups from distillation. Without concepts, there's nothing to "probe one tier deeper" on.
20. **#34 AI evaluation behavior** — the most important acceptance criteria in the entire backlog. Three cases: shallow/vague → AI probes WHY; brilliant answer → AI probes adjacent concept; never grade/score.
21. **#34 explanation-request behavior** — if user asks "just explain X to me": 2-3 sentence WHY-oriented explanation then immediate probe. Never a pure lecture. Bridge, not destination.
22. **Session-interrupt prevention** — if push fires during active session, push is queued silently. Active sessions are never interrupted.
23. **60-day framing constraint in #36** — "not twice in a row" was too weak. Same scenario/framing not reused for same concept within 60 days.
24. **Gap lifecycle fully specified in #29** — open → triaged (important/deferred/dismissed) → addressed. Three closure mechanisms. Important gaps addressed within 5-7 days.
25. **Voice input (#22) is not a launch blocker** — zero-code concern from system's side. Wispr Flow sends plain text. Priority:urgent was wrong; corrected to high.
26. **#22 dependency direction corrected** — "Enables: #19 (daily push)" was wrong. Daily push doesn't depend on voice handling. Fixed to parallel with #21, #23.
27. **Gap list visibility is Phase 1, not Phase 2** — simple /gaps command (#43) belongs in gap tracking foundation, not the Phase 2 dashboard. No visualization required.
28. **Session completion needs explicit criteria** — "when user winds down" is not implementable. Three explicit signals added to #27: /done, 30-minute inactivity, 5+ exchanges.
29. **Technical readiness (Level 2/3) N/A for personal project** — no team, no frontend/backend split, no permission model. Foundation epic stories cover all meaningful readiness.
30. **Gap closure acknowledgment (#44) is a distinct user experience story** — the post-Anki equivalent of card retirement. Without it, learning is invisible — gaps just silently stop appearing. The acknowledgment is factual and mentor-like, never celebratory.
31. **Gap closure is per depth level** — addressing a concept at practitioner depth doesn't prevent new architect-level gaps for the same concept. Same concept can have independent gaps at each depth tier.
32. **Abstract topic support via URL fallback in #31** — no new story needed; URL fallback in #31 handles undocumented or abstract tools (system design, TDD). Phase 2+ for richer support.
33. **#40 is urgent, not high** — Mac Mini crash recovery is a launch blocker. A system that silently stops pushing after a crash fails its core user value. Priority drift rule applied.
34. **#40 and #19 are parallel, not sequential** — crash recovery doesn't gate daily push implementation; both ship together for Phase 1 launch readiness. #40 enables #41.
35. **#16 must cover /setdepth** — #42 assumed a depth-change command without a story to deliver it. Gap closed. Depth changes are configuration, not a separate story.
36. **Tool removal archives gaps, doesn't delete them** — learning history is permanent; tool management should not erase it. User switches frameworks but still owns the insight they developed.
37. **Mastered concepts rotate at low frequency** — tools with zero active gaps still appear occasionally (monthly max) to prevent knowledge atrophy.
38. **Distillation completion gates push rotation** — a new tool enters the daily push only after distillation is done. Correctness constraint: without concept groups, AI has no structured way to pick a question at the right depth.
39. **Depth levels require explanation at point of selection** — "architect" is not universally understood. Three one-liners at the moment of choice prevent wrong defaults and user confusion. Both #31 and #38 now show all three levels.
40. **Cross-cutting nudge uses only active gaps** — addressed gaps don't represent current blind spots. Including them would mislead the user about their current state.
41. **Duplicate tool registration is explicitly handled** — overwriting a registered tool silently is destructive. System must redirect to /update or /setdepth with a clear message.
42. **One cross-cutting nudge per week max** — multiple simultaneous nudges would feel overwhelming. Most prevalent theme wins; others queue for subsequent weeks.
43. **Factual misconceptions probe through contradiction, never correct directly** — AI never says "that's wrong" — it asks a question that makes the user discover the error themselves. Distinct from shallow/vague (WHY probe) or surface-correct (escalate). Added 5th AI response case to #34.
44. **/gaps without argument shows cross-tool summary** — requiring a tool argument creates unnecessary round-trips. Summary table (one line per tool, active gap count) gives immediate orientation and lets users decide where to drill in.
45. **5+ exchanges is a soft checkpoint, not a hard session end** — only /done and 30-min inactivity are hard ends. 5+ exchanges presents summary + Continue option but preserves full session context and tool/depth/thread.
46. **Distillation failure is a fatal alert** — docs URL becoming unreachable silently leaves a tool with stale/missing concepts indefinitely. Classified "fatal — needs human action" in #41's monitoring list.
47. **Deferred gap resurface = notification + state change** — silent state change leaves user never knowing the deferred period ended. Notification fires at day 60; state changes Deferred → Untriaged with re-triage keyboard.
48. **Dismissed gap resurface = single check-in, not automatic re-entry** — dismissal was a user veto. 6-month check-in sends "still confident?" with [Yes, still got it] / [Actually, let's revisit]. Auto re-entry would contradict the veto principle.
49. **Archived tool /gaps format: read-only, no triage buttons** — triage buttons on historical gaps are broken and confusing. Shows "archived (removed YYYY-MM-DD)" banner, historical gaps, no interactive keyboard. Excluded from /gaps no-argument summary.
50. **Tool mastery notification: one-time signal when ALL concept groups reach depth ceiling** — without this, user can't distinguish "system broken" from "genuinely mastered." One-time message with /setdepth suggestion; never repeated.
51. **User-deferred and auto-deferred are distinct states** — user-deferred = excluded from push rotation for 60 days; auto-deferred = lower weight but stays in rotation. User's explicit "not now" must be respected differently from the system's housekeeping action.
52. **Cross-cutting concern taxonomy is fixed: 6 categories** — Security, Performance, Observability, Cost, Reliability, Developer Experience. AI uses only these, never free-form. Consistent taxonomy is what makes cross-cutting pattern detection (#30) and topic menu (#24) reliable.
53. **First-tool onboarding uses open-ended positioning** — when no other tools are registered, system can't reference a comparison tool. Question invites user to share prior context: "What problems might this solve?" — works regardless of background.
54. **Direct text invocation for sessions (no /menu required)** — "let's talk about Lambda" starts discussion immediately. Forcing /menu syntax for every session start is unnecessary friction for a conversational product.
55. **"Maturity scores" is the wrong term** — the product has no scores. "Depth calibration state" is the correct language. Fixed in #26 to prevent implementing agents from building a scoring column in the DB.
56. **Text occlusion scope: system messages only** — applying `[___]` detection to user replies creates false positives on code syntax. Occlusion is a formatting choice the system makes on outbound push messages.
57. **Pass/Fail connects directly to gap tracking and depth escalation** — "Fail" without gap logging is just a stat. The keyboard's value comes from closing the loop: Fail → #28 (gap logged), Pass → #42 (streak toward depth escalation).
58. **#19 depends on #18** — the daily push rotation for a tool presupposes onboarding has been built. Without it, the first push question is contextless. Added to #19's Depends on field.
59. **#37 dependencies must be story-level** — epic-level dependencies are too coarse for implementing agents. Stories within an epic ship at different times. Fixed to specific stories #28, #29, #43, #44.
60. **Distillation quality threshold** — thin content (< 3 meaningful concept groups extractable) is a quality failure, not a technical one. Distinct from URL-unreachable fatal alert. User guided to provide a better URL; tool stays out of rotation until retry succeeds. Added to #35.
61. **#35 cross-cutting taxonomy aligned with #28** — concept group tags must use the same fixed 6 categories as gap tags. Inconsistent prior tags ("auth", "scalability", "deployment") replaced. Added to #35.
62. **Steering to unregistered tool → registration offer, not generic knowledge** — proceeding with unregistered tool knowledge violates the real-docs constraint (#14). Added to #25.
63. **Re-registering a removed tool offers gap restoration** — silent overwrite destroys learning context. "TanStack Start has 12 archived gaps from before. Restore? [Yes] [Start fresh]" is the correct prompt. Added to #16.
64. **First-push confirmation is time-aware** — "tomorrow" is wrong if setup happens before today's push time. System checks whether today's scheduled time has passed and uses "today" or "tomorrow" accordingly. Added to #38.
65. **Gap resolution threshold is explicit and depth-dependent** — architect/practitioner: 2 passes in different sessions; deep: 3 passes in different sessions. Same-session passes don't count. Added to #44.
66. **Session summary shows most recently logged gap** — "most important" was undefined at session end (gaps not yet triaged). Most recently logged = freshest in context, no ranking algorithm needed. All others via "See all gaps." Added to #27.
67. **Auto-defer weight ratio = 1/3 base weight** — "lower weight" was not a spec. 1/3 gives concrete guidance without locking in a complex model. Added weight table to #33.
68. **Consecutive pass streak is per concept group** — passes on different concept groups do NOT combine. A Fail on one group resets only that group's streak. Added to #42.
69. **Pre-indexed tools list = static curated list, shipped with product** — "etc." is not a spec. Agent needs to know how to decide whether a tool is pre-indexed. Added to #31.
70. **Per-session offer suppression for unregistered tools** — 'Not now' dismissal suppresses offer for that session only. Future sessions re-offer once when tool is mentioned again. Added to #31.
71. **Gap creation authority = user only** — AI DOES NOT auto-log gaps. Only user Fail tap (#23) or explicit "I don't know" creates a gap. Prevents silent gap accumulation that recreates Anki guilt. Added to #28.
72. **Low-frequency rotation = one unified rule** — addressed-concept rotation (#19) and mastered-tool rotation (#42) are the same mechanism (≤ once per month). Budget is shared. Added to #19.
73. **Silent reset on return** — 60-day per-concept calibration reset happens without notification. No "welcome back" message, no "your depth was reset." User gets an easier question naturally. Added to #26.
74. **New Fail on dismissed concept → new gap, not resurrection** — dismissed state was user's veto. New Fail is new evidence; creates a fresh gap. Old dismissed record preserved as audit history. Added to #29.
75. **#29 threshold references #44** — #29's "2+ sessions" was inconsistent with #44's depth-dependent spec. Now explicitly references #44. Added #44 to #29's Depends on.
76. **#44 raised to priority:high** — #29 (high) formally depends on #44; prerequisite must be ≥ dependent's priority. Fixed.
77. **Real-docs constraint = registered-tools-only** — for comparative questions involving unregistered tools, AI uses general knowledge for the unregistered side. If comparison shifts focus to unregistered tool, #25 steering applies. Added to #14.
78. **'Am I right?' → probe-as-feedback** — AI never validates yes/no. Responds with a deepening probe. If user presses, brief explanation then continues probing. Added to #34.
79. **Cross-cutting discussion = ONE synthesizing question across all affected tools** — when user accepts the nudge in #30, system sends one question naming all 3+ tools. Standard Socratic flow then continues. Added to #30.
80. **Menu appears inline in session summary, not as a separate message** — menu keyboard at bottom of #27's summary message. One message = gap + progress + 'what next?' keyboard. Added to #24.
81. **Triage button threshold for /gaps = 5 per section** — ≤5 gaps in a section → per-gap inline buttons. >5 gaps → numbered list, reply with number for single-gap triage. Added to #43.
82. **Pass/Fail keyboard in same message as spoiler** — Telegram spoiler reveal is client-side; bot has no reveal event. Keyboard always visible below ||hidden conclusion||. Probe fires on Fail tap, not reveal. Added to #23 and #21.
83. **Multi-tool recency prevents starvation in push** — 7+ days without a tool → recency boost overrides gap count. No strict per-tool minimum (breaks with 8+ tools). Added to #19.
84. **/settime is time-aware (same as #38)** — if new time already passed today → "next push tomorrow"; still upcoming → "push today." Added to #16.
85. **Multi-gap closure: combined acknowledgment** — multiple gaps addressed in one session → one combined list message. Added to #44.
86. **Post-Fail UX: probe IS the acknowledgment** — no separate "Gap logged ✓." Probe existence confirms Fail. Written admissions log silently. Added to #28.
87. **Auto-defer timer: only explicit triage resets it** — timer = creation + 3 days. Session activity does NOT reset the clock. Only triage action resets. Added to #33.
88. **Distillation-in-progress: acknowledgment + completion notification** — two-message flow on /learn: immediate "Got it! Distilling..." + completion "ready. Extracted N concepts." If >60s → quality failure path. Added to #35.
89. **Day-1 cross-cutting section hidden; relative date format on tool buttons** — section hidden when no categories qualify (no empty header). Date format: 'today', '1d ago', 'never'. Added to #24.
90. **Zero-gap session summary: "Solid session" replacement** — "Gaps logged: none" replaced with "Solid session — no new gaps logged." Triage keyboard hidden. Added to #27.
91. **Missed pushes silently dropped — no queue** — queued sessions = Anki debt. Next push fires at next scheduled time only. Added to #26.
92. **Post-escalation streak resets to 0 at new tier; 60-day reset targets configured-depth entry** — (a) streak resets to 0 after escalation; (b) 60-day reset goes to entry of user's CONFIGURED depth, not absolute architect. Added to #42.
93. **Default push time = 9am local; #38 depends on #31** — first-run default = 9am. #38's tool name parsing uses #31. Added to #38.
94. **Mid-session pivot: mini-summary if 2+ exchanges, silent if 0–1** — 2+ exchanges → brief inline summary before pivot; 0–1 → silent close. Added to #25.
95. **'skip' = not-now, no immediate alternative session** — wait for next scheduled push. User can still use menu or free-text. Added to #25.
96. **Triage confirmation: inline keyboard removal, no separate message** — keyboard edited inline; one-line acknowledgment replaces it. Prevents confirmation flood. Added to #29.
97. **'I don't know' → brief foothold question, not lecture** — gap logged (decision 71). AI responds with reframing question, not explanation. Added to #34.
98. **Compound answer (mostly right + misconception) → acknowledge strong parts, then contradiction probe** — brief acknowledgment before probing contradiction. Never skip acknowledgment; never correct directly. Added to #34.
99. **Delayed responses: no delay acknowledgment — just continue** — "acknowledges the gap" conflicted with #26 no-guilt principle. Bot continues without mentioning delay. Added to #15.
100. **Persistence minimum: tool configs + gaps + maturity + last-5-sessions; in-flight generation lost on restart** — "stored in DB" was vague. Enumerated what survives. In-flight generation lost without retry. Added to #15.
101. **Push context line date: relative format** — 'added 2 weeks ago', '3 months ago'. Never ISO date. Added to #19.
102. **Archetype selection: LRU across applicable subset** — LRU: most-recently-used excluded; least-recently-used selected. Deterministic, no LLM memory needed. Added to #36.
103. **Context window = last 3 sessions per concept group** — enough context, small enough prompt. Added to #36.

### Dependency patterns established

- **Foundation chain**: #12 → #13+#14 (parallel) → #15+#16 (parallel) → #38 → #35+#31 (parallel) → #18 → #19 → #21-25 → #28 → #29+#33+#27+#43+#44 → #42
- **Mac Mini readiness**: #40 (urgent, parallel with #19) + #41 (high, depends on #40) must ship for Phase 1 to be reliable on Mac Mini
- **Gap logging chain**: #28 → #29 + #33 + #27 + #43 + #44 → #42
- **#35 and #31 ship simultaneously** — both "system learns from registration" behaviors; #14 enables both
- **Phase 2/3 epics (#8, #9, #10, #11) have no stories** — phase gate enforced. Stories added only after Phase 1 proven for 4+ weeks with 20+ gaps logged.
- **#22 is parallel with #21, #23** — NOT enabling #19 (dependency corrected)
- **#42 full chain**: #35 → #28 → #23 → #15 → #42
- **Tool lifecycle chain**: #16 (register/config) → #31 (natural language registration) → #35 (distillation) → #18 (onboarding) → #19 (push rotation)
- **#14 enables**: #31 (registration) and #35 (distillation)
- **#18 depends on #31** — tool must be registered before onboarding can reference it
- **#43 phased dependency**: base /gaps ships with #28+#29; archived display requires #16 also
- **#19 depends on #18** — daily push rotation presupposes onboarding is built
- **#37 depends on #28, #29, #43, #44** — replaced vague epic-level dependency
- **#33 → #19** (push selection uses auto-defer weighting from #33)
- **#42 → #19** (mastered tools gain low-frequency rotation from #42)
- **#29 → #44** (gap auto-addressing uses #44's depth-specific thresholds)
- **#30 → #34** (cross-cutting discussion follows Socratic evaluation rules from #34)
- **#27 ↔ #24** (topic menu integration: keyboard appears at bottom of #27's summary message)
- **#39/#30 share nudge timer state** — user-initiated (#39) and proactive (#30) cross-cutting sessions share the same 7-day timer; implementing agents must use shared state
- **#41 ↔ #35**: recovery notification (#41) requires distillation-complete signal from #35; both must coordinate on that event
- **#38 → #31**: first-run natural language parsing uses #31; #31 Enables now includes both #18 and #38
- **#34 → #28**: 'I don't know' triggers gap creation via #28 (decision 71 + decision 97)
- **#27 → #43 (progressive, batch 51)**: 'See all gaps' link in session summary requires #43; core summary ships before #43
- **#38 → #15 (batch 54)**: mid-setup abandonment state preservation requires #15 (persistence across restarts)
- **#39 → #29 (batch 57)**: cross-cutting gap-state filtering uses triage state categories from #29

### Items permanently closed/merged

- #32 (session summary 3-line constraint) → merged into #27 as acceptance criteria. Over-granular — length is an AC, not a feature.

### Watch items (active)

- **#16 scope** (8+ behaviors including /settime, /learn, list, remove, /update, /setdepth, gap archival, re-registration restoration): Coherent command set — not splitting. Monitor during implementation.
- **#31 scope** (multiple ACs including mention detection and duplicate handling): Not splitting — same user outcome. Monitor.
- **#25 issue number for #24**: Depends on field lists #24 by title only, no number. Low risk — titles are searchable. Known watch item.
- **Tool mastery watch item**: when all gaps for a tool are addressed → Phase 2+ should offer maintenance mode or tool removal suggestion. No story now.
- **Session history watch item**: user might want to review past sessions (transcript) — Phase 2. No story now.
- **Abstract topic support** (system design, TDD): URL fallback in #31 handles this; no new story.

### Resolved open questions

- GitHub project → ikushlianski/projects/14, repo: ikushlianski/post-anki ✓
- #28 gap override watch item → RESOLVED: "dismissed" state in #29 IS the user veto ✓
- Priority drift rule → RESOLVED: prerequisite must be at least as urgent as its most urgent dependent ✓

### Unresolved open questions

- ❓ Pre-indexed tools for #31 → GitHub issue #31 comment, awaiting user input
- ❓ PM2 vs launchd vs Docker for Mac Mini (#40) → GitHub issue #40 comment

### User situations on record (S1–S93)

**S1–S14**: daily push, silence, on-demand topic, mid-session pivot, post-vacation, new tool onboarding, /stats, cross-cutting nudge, /decide, gap dismissal, first /start, context line on push, gap override via dismiss, deepening mid-session (covered by #25)

**S15–S17**: crash/no push → #40/#41 added; hallucinated docs from stale URL → #35/#18 dependency; OS upgrade kills process → #40

**S22–S26**: interview prep (on-demand intensity → #25); consistent passes → #42 inter-session depth; brilliant first answer → #42 intra-session; Next.js v15 breaking changes → #16 /update; long /decide answer → Telegram truncation watch (#27)

**S27–S28**: rambling answer → #34 WHY probe; brilliant event-driven insight → #34 adjacent escalation

**S29–S32**: push fires during active session → #19 queued; same framing 3 weeks ago → #36 60-day rule; user asks for explanation → #34 WHY bridge + probe; Prisma mention mid-session → #31 register offer

**S33–S35**: user needs gap list before presentation → #43 created; user distracted 45 minutes → #27 inactivity completion; all TanStack Start gaps addressed → tool mastery watch item

**S36–S38**: Lambda cold starts consistently answered correctly → #44 gap closure acknowledgment created; Lambda practitioner gaps addressed, system escalates to architect → #44 depth-level specificity added; user checks /stats after 3 months → #37 addressed count added

**S39–S43**: user wants to change Lambda depth after 3 months → #16 /setdepth; Mac Mini crashes at 2am → #40 upgraded to urgent; user switches to Remix, removes TanStack Start → #16 gap archival; all Lambda concept groups addressed → #19 mastered-concept rotation; new tool registered 2 min before push → #35 distillation gate

**S44–S46**: user sees "depth: architect" and doesn't know what it means → #31 + #38 depth explanation; security AND performance both hit 3-tool threshold same day → #30 weekly nudge cap; #18 missing #31 dependency → fixed

**S47–S50**: user states factual error ("Lambda cold starts only in Java") → AI probes through contradiction, not corrects (#34 5th case); user types /gaps with no argument → cross-tool summary table (#43); user 8 exchanges deep, session auto-triggers at 5 → soft checkpoint, thread preserved (#27); user runs /update with 404 URL → Telegram fatal alert (#41)

**S51–S54**: deferred TanStack gap expires after 60 days → Telegram notification + Untriaged state change (#29); dismissed Lambda cold start gap resurfaces after 6 months → single check-in, user confirms or revisits (#29); user queries /gaps for removed tool → archived banner, read-only, no triage buttons (#43); all Lambda concepts mastered at architect depth → one-time "fully mastered" message with /setdepth suggestion (#42)

**S55–S58**: security gaps in Lambda, Prisma, TanStack Start → cross-cutting pattern matches correctly via fixed 6-category taxonomy (#28); first tool registered, no prior tools → open-ended positioning question (#18); user types "I want to explore Lambda today" → discussion starts immediately without /menu (#24); user returns after 3-week vacation → depth calibration state unchanged, not "scores" reset (#26)

**S59–S60**: user receives push with spoiler-formatted answer → occlusion is outbound only; user replies processed normally (#21); user taps "Fail" on Lambda permissions question → gap logged to Lambda/Security, enters push rotation (#23→#28)

**S61–S63**: Lambda registered with release notes URL → quality threshold fires, user guided to architecture docs (#35); user types "let's switch to Drizzle" mid-session (unregistered) → registration offer, no generic knowledge (#25); user removes TanStack Start, re-adds 2 months later → restoration offer with archived gap count (#16)

**S64–S66**: user runs /start at 7:45am, push at 8:00am → "today at 8am" not "tomorrow" (#38); Lambda security gap passes twice in different sessions → addressed (#44); session logs 4 gaps → most recent shown in summary (#27)

**S67–S72**: auto-defer weight = 1/3 for push selection (#33); streak per concept group, Fail resets only that group (#42); pre-indexed tools = static shipped list (#31); session offer suppression = one session only (#31); gap creation user-only: Fail tap or "I don't know" (#28); low-frequency rotation ≤ once/month shared budget (#19)

**S73–S75**: user dismisses Lambda cold start gap January, fails April → new gap created, dismissed record preserved (#29); user asks how TanStack Start compares to Cloudflare Workers (unregistered) → TanStack side uses stored docs, Cloudflare uses general knowledge (#14); user gives answer then asks "so was I right?" → AI probes deeper, no yes/no (#34)

**S76–S78**: user taps 'yes, let's discuss' on Security cross-cutting nudge → ONE synthesizing question naming Lambda + Prisma + TanStack → standard Socratic flow (#30); session summary sent → topic menu keyboard at bottom of same message (#24/#27); /gaps lambda with 12 gaps per section → threshold determines per-gap vs numbered list (#43)

**S79–S84**: Lambda pricing model session hits "debug challenge" archetype → filtered to applicable archetypes (#36); 7 registered tools in /stats → condensed one-line-per-tool format (#37); user taps [Discuss Security now] in /stats Tuesday → resets nudge timer, no duplicate Friday nudge (#39); fatal alert sent then /update succeeds → recovery confirmation fires (#41); 3-sentence push answer → conclusion hidden, framing+implication visible (#21); incomplete onboarding + same-tool re-entry no URL → resume at zero cost (#18)

**S85–S87**: /learn Lambda docs → 60s silence without spec, with spec: immediate ack + completion notify (#35); day-1 /menu with 0 gaps → cross-cutting section hidden (#24); session with 0 gaps → "Solid session" summary (#27)

**S88–S90**: user misses push, returns later → missed push dropped, next fires at scheduled time (#26); Lambda cold start passes 3× → depth escalates, streak resets to 0 at new tier (#42); /start at 7pm, no /settime → "tomorrow at 9am" (#38)

**S91–S93**: 3 exchanges into TanStack → pivot to Lambda: brief inline summary before switch (#25); taps [Dismiss] on 3 gaps → 3 inline keyboard edits, no separate messages (#29); "I don't know" to Lambda probe → foothold reframe question, gap logged (#34)
104. **/setdepth at new tier: calibration starts at 0** — old-tier streak preserved for possible switch-back. Added to #16.
105. **Re-distillation 'needs re-check' = calibration reset to configured-depth entry + notification** — '[Tool] docs re-distilled — some areas will be re-probed in upcoming sessions.' Added to #16.
106. **Zero-total-gaps educational footer in /gaps** — 'No gaps logged yet — they appear after your first Socratic session.' Added to #43.
107. **Cross-cutting nudge delivery: separate Telegram message immediately after session summary** — ignoring counts as the week's nudge for that theme. Added to #30.
108. **'Addressed this month' = calendar month** — not rolling 30-day window. Added to #37.
109. **Zero-tools /stats empty state** — 'No tools registered yet. Use /start to add your first tool.' Added to #37.
110. **Retry-to-fatal threshold: 3 retries, ≤15 min total** — transient alert fires on first failure; fatal after third retry. Added to #41.
111. **Multi-error deduplication is per-type** — two distinct failure types fire independent alerts; same type deduped per 10-min window. Added to #41.
112. **Unextractable voice claim: one redirect → 'I don't know' path** — if AI cannot extract claim after two attempts, treat as explicit 'I don't know.' Added to #22.
113. **Comparison tool selection: same-category first, most-recently-discussed fallback** — category from distilled concept group tags. Added to #18.
114. **Pass = no auto-follow-up; session stays open but idle** — asymmetry with Fail (one probe) is intentional. Added to #23.
115. **AI embeds spoiler syntax in its own output; no post-processing** — system prompt instructs format; AI handles code-in-spoiler too. Added to #21.
116. **Long-polling, not webhook** — Mac Mini self-hosted behind home router; no public URL dependency. Added to #13.
117. **/start is idempotent** — already-set-up state shows tool count and suggestions instead of re-running onboarding. Added to #13.
118. **Auto-deferred label: '(auto-filed)'; user-deferred label: '(deferred by you)'** — same /gaps Deferred section, distinct labels. Added to #33.
119. **Gap threshold check is event-driven on Pass tap** — immediate O(1) check; no background job. Added to #44.
120. **Gap acknowledgment fires once with session summary** — no duplicate at hard end if already acknowledged at soft checkpoint. Added to #44.
121. **AI auto-generates gap description at logging time** — one sentence from conversation context; user writes nothing. Added to #28.
122. **Gap dedup: idempotent within session; no duplicate for existing open gap** — across sessions: addressed → new gap at depth; dismissed → new gap (Decision 74). Added to #28.
123. **/update always triggers full re-distillation** — no diffing; old concepts replaced when new distillation succeeds. Added to #35.
124. **Atomic replacement: old concepts preserved during re-distillation** — tool stays in rotation until new ones are ready; failure preserves old. Added to #35.
125. **Attribution frequency: at most once per message, specific non-obvious claims only** — no attribution on general reasoning. Added to #14.
126. **Session summary format: single gap shown + 'See all gaps' link** — format example updated to match single-gap spec; multi-gap list in summary is wrong. Added to #27.
127. **Intra-session escalation = AI judgment, 1 strong pass sufficient** — does NOT advance inter-session pass count; inter-session = mechanical 3-pass. Added to #42.
128. **Multi-tool daily selection: combined score (recency × gap weight × depth gap)** — 7-day starvation guard overrides score. Decision 83 propagated to #19 body.
129. **/menu mid-session = steering** — not a new session start; #25 pivot lifecycle applies. /menu from session summary = new session. Added to #24.
130. **/menu zero-state: educational prompt** — 'No learning tools yet. Use /learn [tool] [url] to add your first one.' Consistent with /stats and /gaps zero-states. Added to #24.
131. **Intensity mode is session-scoped** — ends at hard session end or at soft checkpoint 'Save for next session'; next push at normal depth. Added to #25.
132. **Multi-language discussion: AI responds in user's language** — docs English-sourced; discussion language-agnostic; real-docs constraint still applies. Added to #34.
133. **LRU tracks archetype TYPE; 60-day rule tracks specific FRAMING** — two distinct variety levels. Added to #36.
134. **One tool per registration flow** — multiple tools mentioned: process first, offer second sequentially. Added to #31.
135. **Depth flag in command skips keyboard** — '/learn lambda architect' confirms directly without depth keyboard. Added to #31.
136. **Mid-setup abandonment: state preserved; /start resumes from current step** — different tool on return = discard partial state. Added to #38.
137. **Bare greeting on return: brief reply, no absence reference, no session start** — 'hi' is not a learning command; next push at normal scheduled time. Added to #26.
138. **Repeated deferral: always allowed; 3rd+ re-deferral adds [Actually dismiss?] shortcut** — deferral_count per gap required. Added to #29.
139. **Cross-cutting gap count: active states only** — untriaged/important/auto-deferred count; user-deferred/dismissed/addressed excluded. Added to #39.
140. **Crash-window push: silently dropped** — push state NOT stored as pending across restarts; schedule re-derived at startup. Added to #40.
141. **Startup health check failure: exponential retry then stay alive** — 30s/60s/120s retries, 3 max; bot stays alive (no crash loop); logs locally. Added to #40.
142. **/gaps fuzzy multi-match: numbered list, user picks** — if 2+ tools match, numbered list; user replies with number. Never guesses. Added to #43.
143. **/learn re-registration: 4 cases, never silently overwrites** — same URL+depth: redirect. Different URL+same depth: /update. Same URL+different depth: /setdepth. Different URL+depth: combined confirmation. Added to #16.
144. **Fail on auto-deferred gap: returns to Untriaged, resets timer, no duplicate** — new Fail is evidence; auto-deferred → untriaged, base weight restored. Added to #33.
145. **Manual /update cancels in-progress automatic retry** — one distillation per tool; user-initiated supersedes retry. Added to #41.
146. **Nudge threshold includes user-deferred; /stats excludes it** — nudge = pattern exists (user-deferred counts); /stats = current blind spots right now (user-deferred excluded). Added to #30.
147. **No-content push skip: silent** — if all concept groups in low-freq rotation and none at monthly slot, push skips silently. No notification. Added to #19.
148. **One soft checkpoint per session thread** — after Continue tap, no further auto-summaries until hard end. Prevents summary spam. Added to #27.
149. **foundational_order is explicit integer field** — AI assigns 1-N during distillation. Push selection tiebreaker. /concepts shows numbered list. Added to #35.
150. **Concept group stored in push metadata at generation time** — Pass tap looks it up, no NLP inference. Implementing agents must persist concept group with push/question record. Added to #42.
151. **Continue past soft checkpoint ≠ session boundary for pass counting** — one session thread = at most 1 pass credit per gap regardless of UI taps. Added to #44.
152. **Prior-knowledge inquiry is fallback exception only** — fires on semantically empty first responses; any substantive response (even wrong) goes to #34 evaluation. Added to #18.
153. **Canonical archetype order (Scenario→Compare→Design→Cross-cutting→Debug) = tiebreaker** — for first-session selection and equal-LRU-age ties. Single-archetype subset: LRU exclusion suspended, 60-day framing rule still applies. Added to #36.
154. **Intensity mode soft checkpoint: 2 buttons vs 1** — "Continue now" + "Save for next session" in intensity mode; "Continue now" only in normal sessions. "Save for next session" exclusive to intensity mode. Added to #25.
155. **Multi-claim answers evaluated holistically** — dominant reasoning quality determines response path. No per-claim parsing. Added to #34.
156. **Each triageable gap = SEPARATE Telegram message with own keyboard** — Telegram edit API requires message-level independence for independent per-gap keyboard editing. Session summary = 1 main message + N separate gap messages. Added to #29.
157. **Registration offer fires immediately after bot's Socratic reply** — second message in same bot turn, NOT at session end. "End of current exchange" = after current bot reply. Added to #31.
158. **"3-4 messages" AC for first-run setup scoped to happy path** — URL fallback = 4-5 messages; tool name preserved; double failure re-prompts once and preserves state. Added to #38.
159. **Mid-session restart recovery UX** — bot sends graceful context-loss message + topic menu keyboard when session metadata survives but content is lost. Never goes silent or broken. Added to #40.
160. **Numbered list gap selection sends NEW standalone message** — not an edit of the list. Out-of-range: polite error with valid range. Non-numeric: silently abandoned, message processed normally. Added to #43.
161. **Multi-sentence conclusions = one contiguous spoiler block** — code in spoilers = inline single backtick, not fenced blocks (fenced blocks break inside Telegram spoilers). Added to #21.

**S97–S128**: documented in rounds 43–52 (see rounds-archive.md)

**S129–S145**: documented in rounds 53–58 (see rounds-archive.md)

**S94–S96**: Mac Mini crashes during generation → all gap/maturity/session state preserved; in-flight message lost (#15); context line shows "added 3 months ago" relative format (#19); Lambda cold start LRU archetype selection: Design challenge next after Scenario/Compare/Debug (#36)


**S97–S167**: documented in rounds 59–68 (see .project-manager-logs/round-67.md, round-68.md and rounds-archive.md for earlier rounds)

**Dependency patterns added in batches 59–66:**
- #33 → #23: Fail-on-auto-deferred triggered by Fail signal from #23
- #42 → #34: Depth adaptation requires base Socratic evaluation rules
- #41 → #16: Retry cancellation requires /update command
- #41 → #35: Distillation failure alert requires distillation process
- #36 → #15: Archetype LRU storage requires persistence
- #40 → #13: Startup health check needs Telegram connectivity
- #40 → #15: Recovery UX needs session-in-progress metadata from persistence


---
date: 2026-04-17 22:55
skill: project-manager-loop
batch: 67
files: []
---

## What I processed
No new files. Socratic enrichment of existing stories (#13, #22, #26).

## Decisions made
162. #13: Non-text/non-voice messages (photos, stickers, GIFs, files) receive a friendly redirect: 'I can only read text and voice messages.' Bot must not assume all updates have a text field. Added startup offset flush — accumulated downtime messages are skipped on startup, not replayed.
163. #22: Two distinct voice input paths. Path 1 (Wispr Flow): text arrives as message.text, no server work. Path 2 (Telegram native voice clip): arrives as message.voice audio, requires server-side transcription. Both paths supported. On fallthrough to 'I don't know', gap description generated from question topic, not user's inextractable audio.
164. #26: Continuation language ('let's continue', 'where were we') = fresh session start. Tool named → start that tool fresh. No tool named → show /menu. Bot never says 'I lost our context' or acknowledges the discontinuity. No-guilt contract extends to language about past sessions.

## Dependency patterns noticed
None. All changes were enrichments to existing stories.

## Open questions
1. ❓ Pre-indexed tools for #31 — awaiting user input
2. ❓ PM2 vs launchd vs Docker for Mac Mini (#40) — awaiting user input

## Items skipped (duplicates)
None.

## Items created
None.

---
date: 2026-04-17 23:05
skill: project-manager-loop
batch: 68
files: []
---

## What I processed
No new files. Socratic enrichment of existing stories (#23, #28, #30).

## Decisions made
165. #23: Clarifying probe after Fail is a plain conversational message — no Pass/Fail keyboard. Probe is a teaching moment, not a second evaluation. Mid-session follow-up questions requested by user are free-form with no evaluation buttons and do NOT advance the inter-session pass counter.
166. #28: Explicit admission detection is semantic, not keyword-based. Test: did user offer any knowledge content? If yes → not an admission, even with hedging language. Gap description goal = recognizability weeks later; compound sentence acceptable if concept needs two clauses.
167. #30: Cross-cutting session completion does NOT auto-close underlying tool-specific gap records. Gaps close only via explicit /gaps triage or Pass tap in a future tool-specific session. 30-day nudge timer starts on nudge send, not on user engagement.

## Dependency patterns noticed
None. All changes were enrichments to existing stories.

## Open questions
1. ❓ Pre-indexed tools for #31 — awaiting user input
2. ❓ PM2 vs launchd vs Docker for Mac Mini (#40) — awaiting user input

## Items skipped (duplicates)
None.

## Items created
None.

---
date: 2026-04-17 23:15
skill: project-manager-loop
batch: 69 (mandatory review)
files: [no PRD files — review round]
---

## What I processed
Mandatory review round. Reviewed all backlog items with focus on batches 67–68 changes.

## Decisions made
No new product decisions. All 6 audit checks passed with zero fixes.

## Dependency patterns noticed
- **#22 → transcription infrastructure**: Path 2 (Telegram native voice) requires speech-to-text API. Covered by #12 (local setup includes all API keys). No new dep declaration needed.
- **#30 references #44**: Cross-cutting session non-closure references gap addressed-on-Pass rule in #44. Informational — no hard dependency added.

## Open questions
1. ❓ Pre-indexed tools for #31 — awaiting user input
2. ❓ PM2 vs launchd vs Docker for Mac Mini (#40) — awaiting user input

## Items skipped (duplicates)
None.

## Items created
None. Review round only.

---
date: 2026-04-17 23:15
skill: project-manager-loop
batch: COMPACTION EVENT (batches 59–66 archived)
---

THOUGHTS.md reached 11 entries after batch 69. Compacted entries for batches 59–66 into the "Compacted History (batches 1–66)" block. Decisions 147–161 added. Dependency patterns from batches 59–66 added. Batches 67, 68, 69 kept in full.

---
date: 2026-04-17 23:25
skill: project-manager-loop
batch: 70
files: []
---

## What I processed
No new files. Socratic enrichment of existing stories (#37, #39, #24).

## Decisions made
168. #37: Active gaps = untriaged + important + auto-deferred; user-deferred/dismissed/addressed excluded. "Addressed this month" line hidden when count = 0. "Last discussed" = session end timestamp. Consistent with #39's active definition.
169. #39: Cross-cutting threshold requires 2+ active gaps across 2+ DISTINCT tools. Single tool with 2+ gaps of same tag is NOT cross-cutting — it's per-tool. Multiple qualifying themes each get their own inline button.
170. #24: Cross-cutting concern button tap starts synthesizing session with ONE question naming specific affected tools (not generic opener). Tool buttons show "• active" indicator instead of date when session in progress. Concern buttons have no date indicator.

## Dependency patterns noticed
None. All changes were enrichments to existing stories.

## Open questions
1. ❓ Pre-indexed tools for #31 — awaiting user input
2. ❓ PM2 vs launchd vs Docker for Mac Mini (#40) — awaiting user input

## Items skipped (duplicates)
None.

## Items created
None.

---
date: 2026-04-17 23:35
skill: project-manager-loop
batch: 71
files: []
---

## What I processed
No new files. Socratic enrichment of existing stories (#27, #19, #33).

## Decisions made
171. #27: "See all gaps from this session" is filtered to current session only — not the full /gaps backlog. Final summary after continuation covers entire session thread (pre+post checkpoint). Both are important for implementing agents building the summary/session system.
172. #19: Push during active session = silently skipped, not queued. Consistent with #26's no-debt model. Active session IS today's engagement. All-tools-still-distilling → single brief placeholder message fires at that push event.
173. #33: Auto-defer timer starts at gap CREATION TIME (server-side Fail tap), not when user reads the session summary. User offline for 3+ days finds gaps auto-deferred on return. Each return to Untriaged resets the full 3-day timer from that moment.

## Dependency patterns noticed
None. All changes were enrichments to existing stories.

## Open questions
1. ❓ Pre-indexed tools for #31 — awaiting user input
2. ❓ PM2 vs launchd vs Docker for Mac Mini (#40) — awaiting user input

## Items skipped (duplicates)
None.

## Items created
None.

---
date: 2026-04-17 23:45
skill: project-manager-loop
batch: 72 (mandatory review)
files: [no PRD files — review round]
---

## What I processed
Mandatory review round. Reviewed all backlog items with focus on batches 70–71 changes.

## Decisions made
No new product decisions. One dependency fix applied.

## Dependency patterns noticed
- **#24 → #28 (new)**: Cross-cutting section of /menu requires gap data to show concern categories. Gap data owned by #28.
- **#24 → #30 (new)**: Cross-cutting button starts synthesizing session using same format as #30. Without #30, implementing agents don't know what kind of session to start from the cross-cutting button.

## Open questions
1. ❓ Pre-indexed tools for #31 — awaiting user input
2. ❓ PM2 vs launchd vs Docker for Mac Mini (#40) — awaiting user input

## Items skipped (duplicates)
None.

## Items created
None. Review round only.

---
date: 2026-04-17 23:55
skill: project-manager-loop
batch: 73
files: []
---

## What I processed
No new files. Socratic enrichment of existing stories (#35, #16, #15).

## Decisions made
174. #35: Quality failure = any extraction below depth-level minimum (architect: 5, practitioner: 8, deep: 10). Covers partial extractions (context limit mid-way), timeouts (>60s), and thin content. Partial result NEVER silently committed. /concepts zero-arg shows registered tools list; partial match uses fuzzy logic. /update always triggers full re-distillation (no diffing).
175. #16: Archived gaps from removed tools excluded from /stats cross-cutting counts, #30 nudge threshold, and /stats per-tool lines. /gaps [toolname] still shows historical record. "Start fresh" on re-registration marks records as "superseded" — never permanently deleted. Four /learn duplicate-detection cases specified: same URL+depth (redirect), different URL (treat as /update), different depth (treat as /setdepth), both different (combined confirmation).
176. #15: Session boundary = 30-min inactivity from LAST EXCHANGE (not from push send time). Interrupted sessions (restart mid-session) stored as 'interrupted' with empty content; count toward last-5-sessions; AI handles gracefully. No "you're responding late" messages — ever. No "I lost our context" messages on continuation after restart.

## Dependency patterns noticed
None. All changes were enrichments to existing stories.

## Open questions
1. ❓ Pre-indexed tools for #31 — awaiting user input
2. ❓ PM2 vs launchd vs Docker for Mac Mini (#40) — awaiting user input

## Items skipped (duplicates)
None.

## Items created
None.

---
date: 2026-04-18 00:05
skill: project-manager-loop
batch: 74
files: []
---

## What I processed
No new files. Socratic enrichment of existing stories (#18, #29, #38).

## Decisions made
177. #18: Onboarding positioning question fires as the SECOND message in the same bot turn as the distillation completion notification from #35. Cannot fire before distillation (no concept-group context). If distillation fails → no positioning question. If user is mid-session when distillation completes → both messages queue until session ends.
178. #29: Triage keyboard behavior (state machine, confirmation text, deferral_count, 3rd-deferral shortcut) is owned by #29 in ALL contexts — session summary and /gaps. Single implementation, not two. Triage state updates are IMMEDIATE (tap = database commit). Late triage from old keyboard messages is handled gracefully: idempotent for same-state, applies new state otherwise, never blocked.
179. #38: Already-set-up users see a status message on /start (tool count, next push time, action suggestions) — wizard never re-runs for existing users. /start accepts NO arguments. Timezone: Telegram-provided > user-offset > UTC fallback (with "(UTC)" label). /start mid-session = soft session end per #25 steering rules.

## Dependency patterns noticed
None. All changes were enrichments to existing stories.

## Open questions
1. ❓ Pre-indexed tools for #31 — awaiting user input
2. ❓ PM2 vs launchd vs Docker for Mac Mini (#40) — awaiting user input

## Items skipped (duplicates)
None.

## Items created
None.

---
date: 2026-04-18 00:15
skill: project-manager-loop
batch: 75 (mandatory review)
files: [no PRD files — review round]
---

## What I processed
Mandatory review round. Reviewed all backlog items with focus on batches 73–74 changes.

## Decisions made
No new product decisions. Two fixes applied.

## Dependency patterns noticed
- **#30 → #24 (priority fix)**: #24 (high) depends on #30. Priority drift rule requires #30 ≥ high. Raised #30 from medium to high. Now: #30 high, #24 high — consistent.
- **#25 → #24 (number fix)**: #25's Depends on referenced #24 by title only (known watch item from Decision 25). Added issue number. Watch item resolved.

## Open questions
1. ❓ Pre-indexed tools for #31 — awaiting user input
2. ❓ PM2 vs launchd vs Docker for Mac Mini (#40) — awaiting user input

## Items skipped (duplicates)
None.

## Items created
None. Review round only.

---
date: 2026-04-18 00:25
skill: project-manager-loop
batch: 76
files: []
---

## What I processed
No new files. Socratic enrichment of existing stories (#31, #34, #41).

## Decisions made
180. #31: Web search result is ALWAYS confirmed with user before registration — never auto-used. Two-phase flow: immediate ack → URL confirmation with [Yes, use this] / [No, enter URL manually]. Pre-indexed tools skip Phase 1 (instant depth keyboard). Web search failure → URL prompt inline. System shows ONE candidate URL, not a list.
181. #34: Clarifying questions about the push question → AI rephrases question concretely without explaining the concept. No lecture, no hint. Very-low-baseline: one bridging question, then natural end. Silence after push delivery (no response) = nothing. No retry, no guilt. Distinct from mid-session inactivity (which uses 30-min timer from #15).
182. #41: Error deduplication = per-error-type per-tool. Lambda failure and Temporal failure fire independent alerts. Missed push = 1 scheduling-level alert (not per-tool). Default ops alert channel = same chat as learning (same chat ID). No separate ops channel configuration needed. Startup health check failures = 🔴 alerts, distinct from runtime errors.

## Dependency patterns noticed
None. All changes were enrichments to existing stories.

## Open questions
1. ❓ Pre-indexed tools for #31 — awaiting user input
2. ❓ PM2 vs launchd vs Docker for Mac Mini (#40) — awaiting user input

## Items skipped (duplicates)
None.

## Items created
None.
