---
type: seed-data
branch: chrome-extension-note-capture
task: seed initial hierarchy for post-anki note-capture extension
state: editable
updated: 2026-07-11
---

# Seed data: Subject "Webdev"

Editable appendix. Tweak freely before running the seed script (see `spec.md`
implementation order). Curricula are created via the lightweight (no-AI,
no-sources) creation path; modules are created via the existing manual
`createModule` endpoint. No `sources` rows, no AI reparse — this is
hand-structured scaffolding, not AI-synthesized content.

## Curriculum: AI Dev
- LLM APIs & SDKs
- Agents & Orchestration
- RAG & Vector Search
- AI Coding Tools
- MCP & Agent Skills
- Structured Outputs & Function Calling
- Context & Cost Engineering
- Multi-Agent Orchestration

## Curriculum: AI Theory
*(practical approaches for a working web dev, not deep math)*
- Emerging Research
- Prompt Engineering Patterns
- Model Selection & Cost Tradeoffs
- Evaluating AI Output for Production
- How LLMs Actually Work (light)

## Curriculum: Cloud & Infrastructure
*(cross-provider advanced concepts, not service-by-service)*
- Networking Fundamentals
- IAM & Access Control
- Security & Compliance at Scale

## Curriculum: Web Performance
*(FE and BE)*
- Frontend Rendering Performance
- Backend & API Performance
- Network & Loading Performance
- Profiling & Observability

## Curriculum: TanStack Ecosystem
*(high-level concepts/gotchas/comparisons — e.g. vs Next.js — minimal code)*
- TanStack Start
- TanStack DB & Local-first
- TanStack Query
- TanStack Router

## Curriculum: Databases
*(PG, indexes, performance, transactions — patterns and best practices, not heavy SQL)*
- PostgreSQL Indexing & Query Planning
- Transactions & Concurrency
- Schema Design & JSON Patterns
- Scaling & Replication Patterns

## Curriculum: React
- State Management Patterns
- Modern React (Server Components, Suspense, Compiler)
- Performance & Rendering Patterns

## Curriculum: Next.js
- App Router & Server Components
- Data Fetching & Caching
- Deployment & Edge Runtime

## Curriculum: Monitoring & Observability
*(web and AI)*
- Web Observability (RUM, tracing)
- AI/LLM Observability (tracing, evals in prod)
- Alerting & SLOs

## Curriculum: Node.js Internals
- Event Loop & Async Internals
- Streams & Buffers
- Runtime & Module System (ESM/CJS, workers)

## Curriculum: Security
- AuthN/AuthZ Fundamentals
- Common Web Vulnerabilities (OWASP)
- Secrets & Dependency Security

## Curriculum: Web Architecture
*(FE and especially BE — messaging, microservices, design patterns, scalability)*
- Messaging & Event-driven Architecture
- Microservices Patterns
- Scalability & Design Patterns

## Curriculum: Auth & Permissions
- Auth Protocols (OAuth/OIDC/JWT)
- Session & Token Management
- Authorization Models (RBAC/ABAC)

## Curriculum: Production Readiness & Delivery
*(broader than CI/CD — the gap between "works for me" and production-grade)*
- CI/CD Pipeline Design (build/test/deploy stages, environments, rollback)
- Release & Deployment Strategies (blue-green, canary, feature flags)
- Production Observability & Alerting (the delivery-process side — dashboards,
  SLO-driven alerts, on-call visibility)
- Incident Response & On-call Practices
- Production Security Practices (secrets management, dependency scanning,
  least-privilege deploy pipelines)

---
**Total**: 1 subject, 14 curricula, ~51 modules.
