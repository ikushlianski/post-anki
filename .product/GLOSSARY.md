# Glossary

## Concept *(also called "atom" informally)*
A living knowledge cluster within a Tool or cross-cutting category. Has one maturity score that only moves on interaction. Examples: "Next.js Caching Model", "SQS Queue Design."
**Not:** a gap (a demonstrated unknown). "Atom" is informal shorthand for the same construct.

## Cross-cutting concern
A theme that spans multiple tools: Security, Performance, Observability, Cost, Reliability, Developer Experience. Gaps tagged with a concern category accumulate across tools and trigger pattern-level Socratic sessions.
**Not:** a tool-specific concept. Cross-cutting concerns have no single tool parent.

## Daily push
The system-initiated Socratic question that fires once per day at a scheduled time. Sources from the concept store across all tools.
**Not:** a notification or reminder. It IS the session opener.

## Depth calibration
The system's running estimate of how deeply the user has internalized a specific concept. Drives question difficulty and gap threshold.
**Not:** a score shown to the user. Purely internal to question selection.

## Gap
What the user demonstrably does not know, surfaced during a Socratic session. Created only by user Fail tap or explicit "I don't know." Has a triage state: important / deferred / dismissed.
**Not:** a concept (a growing knowledge cluster).

## Maturity
Four-level scale per concept: 0–25 Familiar → 26–50 Understood → 51–75 Competent → 76–100 Architect. Only changes on interaction; never decays passively.
**Not:** a score displayed to the user. Internal selection signal.

## Core user
A senior developer (10+ years, TypeScript/Node/React/AWS) transitioning to an architect role. Primary risk: becomes an AI relay — asking AI for answers instead of forming own architectural judgment.
**Not:** a general learner. The product is calibrated to someone who already knows syntax and needs judgment.

## Discussion mode
A user-initiated or auto-initiated Socratic session where the AI reads the registered doc or ingested article as ground truth and probes the user's understanding. Never lectures unprompted.
**Not:** quiz mode. Discussion mode is open-ended; quiz mode is a targeted daily push.

## Quiz mode
The daily auto-push: one Socratic question with 2–3 follow-ups. System picks the concept; binary Pass/Fail. Silence on no response.
**Not:** discussion mode. Quiz mode is system-initiated and time-bounded.

## quick_test (question kind)
A tap-only multiple-choice probe (schema `kind: "quick_test"`), the peer of `socratic`. Its purpose is the **hands-and-eyes-only context**: subway, public place, ~5 min, can't talk. The user picks the mode that fits the moment — quiz never auto-replaces Socratic.
**Not:** the primary learning loop. Socratic is the default when the user can talk; quick_test is a fallback input channel, not a downgrade.

## /decide mode
User describes a real architectural decision they're facing. System forces opinion-first — user must reason through it before AI evaluates. Prevents the AI-relay failure mode.
**Not:** discussion or quiz. /decide mode is judgment training on the user's own live decisions.

## Tool
The top-level knowledge unit. Represents a framework, library, or technology the user wants to understand (e.g., Next.js, Lambda). Has a depth level and ~10 system-generated concepts.
**Not:** a generic topic. Tools are specific, registerable, and have real documentation.

---

# Curriculum vocabulary *(PROVISIONAL — web UI draft, not yet reconciled with Tool→Concept)*

These terms drive the web curriculum-builder UI. They sit **parallel** to the Tool→Concept hierarchy above; reconciling the two (does a Curriculum replace a Tool? is a Topic a Concept?) is an open question, see [[.inbox/OPEN-QUESTIONS]].

## Subject *(provisional)*
Top-level grouping in the web UI — a broad domain the user wants to grow in, tech or not. Examples: "Web Development", "AI", "English". Holds multiple curricula.
**Not:** a Tool (narrower) and **not** a single course (that's a Curriculum). "Fundamentals of Back-End" is a Curriculum *under* the "Web Development" subject.

## Curriculum *(provisional)*
A user-authored course on something the user deems worth knowing, built from **sources the user provides** (links/docs), not from model memory. Lives under a Subject. Status: `draft` (captured) → `curating` (AI drafted topics+questions) → `ready`. First two: "Fundamentals of Back-End for Senior Developers", "AI Agent Building".
**Not:** a flashcard deck. Capture-first; AI generation is a later step.

## Source *(provisional)*
Material feeding a curriculum: `link` or pasted `text` now, files later. Attached to a curriculum.

## Topic *(provisional)*
A unit within a curriculum's drafted structure. User can opt it **in/out** and attach a **self-grade** (1–5). Carries generated questions.
**Not:** a Gap. A Topic is a planned area; a Gap is a demonstrated unknown.

## Self-grade *(provisional)*
User's 1–5 self-estimate of knowledge on a Topic. A **soft hint** for question difficulty — explicitly "taken with a grain of salt", not ground truth. Contrast [[Depth calibration]] (system-measured).

## Module *(provisional)*
A grouping of Topics within a Curriculum (Curriculum → Module → Topic). The level at which progress is summarised in the UI.

## Question kind *(provisional)*
A probe is either **Socratic** (free-text, open-ended, user self-marks pass/fail) or **quick test** (multiple-choice, auto-graded). A topic can hold both; the user picks one or multiple to test themselves.

## Mastery *(provisional, web)*
Per-topic demonstrated score 0–100 = in-scope gaps covered ÷ total in-scope gaps. Moved only by probe outcomes, distinct from [[Self-grade]] (the user's estimate). Drives progress bars and the "smart next step" recommendation. Provisional UI heuristic; the real signal is the engineer's [[Depth calibration]] / [[Maturity]].

## Gap *(updated — web model)*
A specific sub-point within a Topic, with status `open` or `covered` and a `depth` (aware/working/deep). Surfaced/closed by probe evaluation: an answer covering more than asked closes multiple gaps at once. Probing always targets **open** gaps — never re-tests covered ones. Extends the original [[Gap]] notion (a demonstrated unknown) into the structural unit progress is measured in.

## Target depth *(provisional)*
Per-topic ceiling the user sets — `aware` < `working` < `deep` — the bottom past which the mentor won't dig (e.g. "what a socket is", not the electronics). Gaps deeper than the ceiling are parked out-of-scope: not probed, not counted toward mastery. The mentor asks how deep per topic/module. Distinct from include/skip (whole topic).

## Dynamic question *(provisional)*
A probe (Socratic or quick-test) generated at runtime to target one open gap — not stored on the curriculum. Drafting produces modules/topics, never a fixed question list; the next question depends on which gaps remain open.
