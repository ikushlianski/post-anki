import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, isNull } from "drizzle-orm";
import { domainNodes, subjects } from "../src/db/schema.js";
import { newId } from "../src/shared/id.js";

// Starting-point domain hierarchy for the one existing "Programming / Web
// Development" subject — a small, sensible first cut (not a port of the
// issue's own ~50-course proposal), mirroring the Frontend/Backend/Cloud &
// DevOps/Architecture & Patterns taxonomy already drafted in the issue's
// 2026-07-18 comment. Static, no LLM call — matches seed-subjects.ts's own
// precedent exactly.
interface SeedNode {
  name: string;
  description?: string;
  children?: SeedNode[];
}

export const SEED_SUBJECT_NAME = "Programming / Web Development";

export const SEED_HIERARCHY: SeedNode[] = [
  {
    name: "Frontend",
    description: "Client-side web development — UI frameworks, styling, browser fundamentals.",
    children: [
      { name: "React", description: "Components, hooks, and the wider React ecosystem." },
      {
        name: "Meta-frameworks",
        description: "Full-stack React/Vue frameworks layered on top of a routing convention.",
        children: [
          { name: "Next.js", description: "The App Router, server components, and edge rendering." },
          { name: "Remix", description: "Nested routing and loader/action data conventions." },
          { name: "Nuxt.js", description: "Vue's own meta-framework." },
        ],
      },
    ],
  },
  {
    name: "Backend",
    description: "Server-side application development — runtimes, APIs, data access.",
    children: [
      { name: "Node.js", description: "The event loop, streams, and the wider npm ecosystem." },
      {
        name: "APIs",
        description: "Designing and building service interfaces.",
        children: [
          { name: "REST", description: "Resource-oriented HTTP API design." },
          { name: "GraphQL", description: "Schema-first, query-driven API design." },
        ],
      },
    ],
  },
  {
    name: "Cloud & DevOps",
    description: "Deploying, scaling, and operating applications in production.",
    children: [
      { name: "AWS", description: "Core AWS services and their common application patterns." },
      { name: "Containers & Orchestration", description: "Docker, Kubernetes, and container-native deployment." },
    ],
  },
  {
    name: "Architecture & Patterns",
    description: "Cross-cutting design knowledge independent of any one language or framework.",
    children: [
      { name: "System Design", description: "Scalability, reliability, and distributed-systems tradeoffs." },
      { name: "Design Patterns", description: "Reusable object-oriented and functional design solutions." },
    ],
  },
];

export interface SeedDomainNodesResult {
  created: number;
  skipped: number;
}

type Db = ReturnType<typeof drizzle>;

async function seedNode(
  db: Db,
  subjectId: string,
  parentId: string | null,
  node: SeedNode,
  order: number,
  result: SeedDomainNodesResult,
): Promise<void> {
  const existing = await db
    .select({ id: domainNodes.id })
    .from(domainNodes)
    .where(
      and(
        eq(domainNodes.subjectId, subjectId),
        parentId === null ? isNull(domainNodes.parentId) : eq(domainNodes.parentId, parentId),
        eq(domainNodes.name, node.name),
      ),
    )
    .limit(1);

  let nodeId: string;

  if (existing.length > 0) {
    result.skipped += 1;
    nodeId = existing[0]!.id;
  } else {
    nodeId = newId("dnode");

    await db.insert(domainNodes).values({
      id: nodeId,
      subjectId,
      parentId,
      name: node.name,
      description: node.description ?? null,
      order,
    });
    result.created += 1;
  }

  const children = node.children ?? [];

  for (const [index, child] of children.entries()) {
    await seedNode(db, subjectId, nodeId, child, index, result);
  }
}

// Looked up under the existing "Programming / Web Development" subject by
// name — fails loudly if that subject doesn't exist (it's a prerequisite,
// seeded by the existing seed-subjects.ts). For each node: check existence
// by (subjectId, parentId, name) via a SELECT before INSERT, mirroring
// seed-subjects.ts's own existing-name check pattern exactly, so a second
// run creates nothing new.
export async function seedDomainNodes(db: Db): Promise<SeedDomainNodesResult> {
  const subjectRows = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(eq(subjects.name, SEED_SUBJECT_NAME))
    .limit(1);

  const subject = subjectRows[0];

  if (!subject) {
    throw new Error(
      `seed-domain-nodes: prerequisite subject "${SEED_SUBJECT_NAME}" does not exist — run seed-subjects.ts first`,
    );
  }

  const result: SeedDomainNodesResult = { created: 0, skipped: 0 };

  for (const [index, node] of SEED_HIERARCHY.entries()) {
    await seedNode(db, subject.id, null, node, index, result);
  }

  return result;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed domain nodes");
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  const result = await seedDomainNodes(db);

  await pool.end();
  console.log(`domain nodes seeded: created: ${result.created}, skipped: ${result.skipped}`);
}

// Guarded so importing seedDomainNodes() for tests never auto-runs the CLI
// entry point (unlike seed-subjects.ts, which has no such guard — this one
// needs it because it's imported directly by
// apps/api/src/domain-map/seed-domain-nodes.integration.test.ts).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
