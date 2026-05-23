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

## /decide mode
User describes a real architectural decision they're facing. System forces opinion-first — user must reason through it before AI evaluates. Prevents the AI-relay failure mode.
**Not:** discussion or quiz. /decide mode is judgment training on the user's own live decisions.

## Tool
The top-level knowledge unit. Represents a framework, library, or technology the user wants to understand (e.g., Next.js, Lambda). Has a depth level and ~10 system-generated concepts.
**Not:** a generic topic. Tools are specific, registerable, and have real documentation.
