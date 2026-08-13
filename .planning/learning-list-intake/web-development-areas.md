---
type: seed-data-design
branch: To-Learn-List
task: fixed Areas for the web-development sub-subjects
state: draft
updated: 2026-08-07
---

# Fixed Areas — Web Development (Node.js / React / AWS developer)

Scope: **web development only**, for this developer profile. Other domains keep today's taxonomy
untouched until they get the same treatment.

## Structure

```
web-development                    (domain, exists)
├── React            (sub-subject, NEW — under frontend-development)
├── Node.js          (sub-subject, NEW — under backend-development)
└── AWS              (sub-subject, NEW — under web-development, cross-linked to cloud-computing)
      └── each has exactly 10 fixed Areas + "Other"
```

Rules:
- Areas are `domain_nodes` with `source: "static_taxonomy"` and `kind: "area"`.
- **Exactly 10 + "Other" per sub-subject. AI can never create an Area.** Unclassifiable content
  lands in "Other"; "Other" filling up is the human signal to revisit this file.
- Areas are **not** where cross-cutting concerns live. No "Security" Area anywhere — security is
  a `concern` on the curriculum/topic, so it stays visible across all three sub-subjects at once.

## React — source: [react.dev/learn](https://react.dev/learn) section structure

| # | Area | Covers |
|---|---|---|
| 1 | Components, JSX & Props | first component, import/export, JSX markup, curly braces, passing props, children |
| 2 | Rendering Logic & Purity | conditional rendering, lists, keys, keeping components pure, UI as a tree |
| 3 | State Fundamentals | state as a component's memory, render & commit, state as a snapshot, queueing updates, updating objects/arrays |
| 4 | State Architecture | choosing state structure, sharing state between components, preserving & resetting state |
| 5 | Reducers & Context | extracting state logic into a reducer, passing data deeply with context, scaling up |
| 6 | Effects & Synchronization | synchronizing with effects, you might not need an effect, lifecycle of reactive effects, separating events from effects, removing dependencies |
| 7 | Refs & DOM Escape Hatches | referencing values with refs, manipulating the DOM with refs |
| 8 | Custom Hooks & Logic Reuse | reusing logic with custom hooks |
| 9 | Performance & Concurrent Rendering | memo, useMemo/useCallback, transitions, Suspense, React Compiler |
| 10 | Server Components & Data Loading | RSC, server/client boundary, streaming, data fetching patterns |
| 11 | Other | anything not covered above |

Areas 1–8 map 1:1 onto react.dev's own four Learn sections (Describing the UI / Adding
Interactivity / Managing State / Escape Hatches). Areas 9–10 are added because react.dev keeps
Compiler and Server Components outside Learn, but a working React developer needs both.

## Node.js — source: [nodejs.org/en/learn](https://nodejs.org/en/learn) category structure

| # | Area | Covers |
|---|---|---|
| 1 | Runtime & Module System | V8, Node vs browser, ESM/CJS, globals, ES2015+ |
| 2 | Async Model & Event Loop | callbacks, promises, event loop, blocking vs non-blocking, `nextTick`/`setImmediate`, timers |
| 3 | Streams & Backpressure | streams, backpressure, pipelines |
| 4 | Filesystem & Paths | file stats, paths, read/write, descriptors, folders, cross-filesystem |
| 5 | HTTP & Networking | anatomy of an HTTP transaction, fetch, WebSocket clients, enterprise network config |
| 6 | Processes, Concurrency & Workers | concurrency models, child processes, worker threads, clustering, env vars, CLI/REPL |
| 7 | Packages & Publishing | npm, package.json, semver, publishing, Node-API packages |
| 8 | TypeScript in Node | native TS, transpilation, runners, publishing a TS package |
| 9 | Testing | `node:test` runner, mocking, code coverage |
| 10 | Diagnostics & Performance | debugging, inspector, heap profiler/snapshots, GC tracing, flame graphs, profiling |
| 11 | Other | anything not covered above |

nodejs.org's "Security Best Practices" article deliberately has **no Area** — it enters as
`concern: security` instead, so it also surfaces against React and AWS.

## AWS — source: service categories + [Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html)

| # | Area | Covers |
|---|---|---|
| 1 | Identity & Access | IAM roles/policies, STS, Cognito, resource policies |
| 2 | Compute | Lambda, Fargate/ECS, EC2, App Runner |
| 3 | Storage | S3, EBS, EFS, lifecycle & durability |
| 4 | Databases | RDS/Aurora, DynamoDB, ElastiCache, connection management |
| 5 | Networking & Delivery | VPC, ALB, API Gateway, CloudFront, Route 53 |
| 6 | Messaging & Events | SQS, SNS, EventBridge, Step Functions |
| 7 | Observability | CloudWatch logs/metrics/alarms, X-Ray, structured tracing |
| 8 | IaC & Deployment | CloudFormation, CDK, Pulumi, CI/CD pipelines |
| 9 | Cost & Capacity | pricing models, scaling, budgets, right-sizing |
| 10 | AI/ML Services | Bedrock, agents, SageMaker, model hosting |
| 11 | Other | anything not covered above |

**Why the Well-Architected pillars are not the Areas.** Five of AWS's six pillars are quality
attributes that already exist as post-anki concerns: security→`security`,
reliability→`reliability`, performance efficiency→`performance`, cost optimization→`cost`,
operational excellence→`observability`/`developer_experience`. Only sustainability has no
counterpart. Using the pillars as Areas would double-count the concern axis; using service
categories keeps the two axes orthogonal — Areas answer *what part of AWS*, concerns answer
*what quality*.
