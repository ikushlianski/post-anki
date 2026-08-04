import process from "node:process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, isNull } from "drizzle-orm";
import { domainNodes, subjects } from "../src/db/schema.js";
import { newId } from "../src/shared/id.js";
import { parseTaxonomyYaml, type SeedNode } from "../src/domain-map/parse-taxonomy-yaml.js";

// seed-static-taxonomy (#82 follow-up to #84) — the static IT taxonomy the
// curriculum-to-domain-node mapping flow (#84) maps curricula onto. Mirrors
// seed-domain-nodes.ts's own exact pattern (no LLM call, existence-checked
// SELECT before INSERT so a second run creates nothing new) with one
// difference: every seeded node carries source: "static_taxonomy"
// (seed-domain-nodes.ts's nodes stay the schema default, "ai_generated" —
// that script's own dynamically-discovered hierarchy is a different,
// pre-existing thing this ticket doesn't touch).
//
// The full 208-node, 15-domain taxonomy (#83's output) now loads from
// apps/api/scripts/seed-data/it-taxonomy.yaml via parseTaxonomyYaml, instead
// of the small in-file placeholder #84 originally hardcoded here.
//
// Decision #2 (which subject receives this taxonomy in PRODUCTION) is still
// pending on GitHub issue #84 — this script stays parameterized by subject
// id via a CLI argument specifically so it isn't blocked on that decision
// landing before code ships (architecture.md's Rollout step 2).
const TAXONOMY_YAML_PATH = new URL("./seed-data/it-taxonomy.yaml", import.meta.url);

export interface SeedDomainTaxonomyResult {
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
  result: SeedDomainTaxonomyResult,
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
      source: "static_taxonomy",
    });
    result.created += 1;
  }

  const children = node.children ?? [];

  for (const [index, child] of children.entries()) {
    await seedNode(db, subjectId, nodeId, child, index, result);
  }
}

function loadTaxonomy(): SeedNode[] {
  const yamlText = readFileSync(TAXONOMY_YAML_PATH, "utf8");

  return parseTaxonomyYaml(yamlText);
}

export async function seedDomainTaxonomy(
  db: Db,
  subjectId: string,
): Promise<SeedDomainTaxonomyResult> {
  const subjectRow = (
    await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId)).limit(1)
  )[0];

  if (!subjectRow) {
    throw new Error(
      `seed-domain-taxonomy: subject id "${subjectId}" does not exist — create it first`,
    );
  }

  const taxonomy = loadTaxonomy();
  const result: SeedDomainTaxonomyResult = { created: 0, skipped: 0 };

  for (const [index, node] of taxonomy.entries()) {
    await seedNode(db, subjectId, null, node, index, result);
  }

  return result;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the domain taxonomy");
  }

  const subjectId = process.argv[2];

  if (!subjectId) {
    throw new Error(
      "usage: seed-domain-taxonomy.ts <subjectId> — the subject to seed the static taxonomy into (Decision #2, issue #84)",
    );
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  const result = await seedDomainTaxonomy(db, subjectId);

  await pool.end();
  console.log(`domain taxonomy seeded: created: ${result.created}, skipped: ${result.skipped}`);
}

// Guarded so importing seedDomainTaxonomy() for tests never auto-runs the
// CLI entry point (same precedent as seed-domain-nodes.ts).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
