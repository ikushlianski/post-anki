import process from "node:process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, isNull } from "drizzle-orm";
import {
  resolveTaxonomyPrerequisiteEdges,
  detectYamlIdConflict,
  type TaxonomyPrerequisiteNode,
} from "@post-anki/core";
import {
  domainNodes,
  domainNodeLinks,
  domainNodePrerequisites,
  subjects,
} from "../src/db/schema.js";
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
//
// learning-list-intake adds a SECOND file, loaded after the first: the fixed
// React / Node.js / AWS sub-subjects and their 10 Areas + "Other". It
// re-declares the Web Development / Frontend Development / Backend
// Development scaffold by name only so the existence check below resolves
// each to the row it-taxonomy.yaml already seeded (skipped, never
// duplicated) and hangs the new sub-subjects off it. Order matters: the
// base taxonomy must be seeded first for that to resolve.
const TAXONOMY_YAML_PATHS = [
  new URL("./seed-data/it-taxonomy.yaml", import.meta.url),
  new URL("./seed-data/web-dev-areas.yaml", import.meta.url),
];

export interface SeedDomainTaxonomyResult {
  created: number;
  skipped: number;
}

type Db = ReturnType<typeof drizzle>;

// learning-paths (module 1) — accumulated across the WHOLE node-insertion
// pass (every root, every taxonomy YAML file), so it is complete before
// resolveTaxonomyPrerequisiteEdges ever runs against it. This is the "two
// pass" in "two-pass seed": pass one (seedNode, below) inserts nodes and
// fills these two accumulators; pass two (seedPrerequisiteEdges) resolves
// and writes edges only once pass one has finished entirely, which is what
// makes forward and cross-branch yamlId references resolve regardless of
// declaration order (SCENARIO 14).
interface PrerequisiteSeedState {
  yamlIdToNodeId: Map<string, string>;
  pendingNodes: TaxonomyPrerequisiteNode[];
}

async function seedNode(
  db: Db,
  subjectId: string,
  parentId: string | null,
  node: SeedNode,
  order: number,
  result: SeedDomainTaxonomyResult,
  prerequisiteState: PrerequisiteSeedState,
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
      kind: node.kind ?? null,
    });
    result.created += 1;
  }

  // Recorded on every run, not only when the node is freshly created — an
  // idempotent second run must rebuild the same complete map so
  // seedPrerequisiteEdges' own existence check still has every yamlId to
  // resolve against.
  if (node.yamlId !== undefined) {
    const conflict = detectYamlIdConflict(prerequisiteState.yamlIdToNodeId, node.yamlId, nodeId);

    if (conflict) {
      throw new Error(
        `seed-domain-taxonomy: duplicate yamlId "${conflict.yamlId}" resolves to two different domain nodes ("${conflict.previousNodeId}" and "${conflict.nodeId}", node name "${node.name}") — fix the duplicate id in the source YAML`,
      );
    }

    prerequisiteState.yamlIdToNodeId.set(node.yamlId, nodeId);

    if (node.prerequisiteYamlIds !== undefined && node.prerequisiteYamlIds.length > 0) {
      prerequisiteState.pendingNodes.push({
        yamlId: node.yamlId,
        prerequisiteYamlIds: node.prerequisiteYamlIds,
      });
    }
  }

  const children = node.children ?? [];

  for (const [index, child] of children.entries()) {
    await seedNode(db, subjectId, nodeId, child, child.order ?? index, result, prerequisiteState);
  }
}

// learning-paths (module 1), SCENARIO 14 — pass two of the two-pass seed.
// Runs only after every root across every taxonomy YAML file has been
// inserted (prerequisiteState.yamlIdToNodeId is complete at this point), so
// resolveTaxonomyPrerequisiteEdges resolves forward and cross-branch
// references correctly regardless of declaration order. Existence-checked
// SELECT-before-INSERT per edge — same idempotent convention as seedNode
// and seedAwsCloudComputingLink above, backed by
// domain_node_prerequisites_node_prerequisite_unique so a second run
// creates no duplicate edges even if this check were ever raced.
async function seedPrerequisiteEdges(
  db: Db,
  prerequisiteState: PrerequisiteSeedState,
): Promise<void> {
  const edges = resolveTaxonomyPrerequisiteEdges(
    prerequisiteState.yamlIdToNodeId,
    prerequisiteState.pendingNodes,
  );

  for (const edge of edges) {
    const existingEdge = (
      await db
        .select({ id: domainNodePrerequisites.id })
        .from(domainNodePrerequisites)
        .where(
          and(
            eq(domainNodePrerequisites.domainNodeId, edge.domainNodeId),
            eq(domainNodePrerequisites.prerequisiteNodeId, edge.prerequisiteNodeId),
          ),
        )
        .limit(1)
    )[0];

    if (existingEdge) {
      continue;
    }

    await db.insert(domainNodePrerequisites).values({
      id: newId("dnprereq"),
      domainNodeId: edge.domainNodeId,
      prerequisiteNodeId: edge.prerequisiteNodeId,
    });
  }
}

export function loadTaxonomy(): SeedNode[] {
  return TAXONOMY_YAML_PATHS.flatMap((path) => parseTaxonomyYaml(readFileSync(path, "utf8")));
}

// lms-buildout 0.7 — AWS (web-dev-areas.yaml, under Web Development) is
// also Cloud Computing (it-taxonomy.yaml's own root) — the motivating case
// for domain_node_links. Looked up defensively by walking Web Development
// (root) -> AWS, rather than a bare name match: a bare "name = 'AWS'" match
// is genuinely ambiguous against the placeholder taxonomy some tests seed
// into the same subject (see seed-domain-taxonomy.integration.test.ts's
// PLACEHOLDER_HIERARCHY, which also has an "AWS" node, under "Cloud &
// DevOps").
//
// Existence-checked SELECT-before-INSERT, same idempotent pattern as
// seedNode above — a second run creates nothing new. Deliberately NOT
// folded into SeedDomainTaxonomyResult's created/skipped counters: those are
// pinned to domain_nodes row counts by existing tests and callers.
async function seedAwsCloudComputingLink(db: Db, subjectId: string): Promise<void> {
  const webDevelopment = (
    await db
      .select({ id: domainNodes.id })
      .from(domainNodes)
      .where(
        and(
          eq(domainNodes.subjectId, subjectId),
          isNull(domainNodes.parentId),
          eq(domainNodes.name, "Web Development"),
        ),
      )
      .limit(1)
  )[0];

  if (!webDevelopment) {
    return;
  }

  const aws = (
    await db
      .select({ id: domainNodes.id })
      .from(domainNodes)
      .where(
        and(
          eq(domainNodes.subjectId, subjectId),
          eq(domainNodes.parentId, webDevelopment.id),
          eq(domainNodes.name, "AWS"),
        ),
      )
      .limit(1)
  )[0];

  const cloudComputing = (
    await db
      .select({ id: domainNodes.id })
      .from(domainNodes)
      .where(
        and(
          eq(domainNodes.subjectId, subjectId),
          isNull(domainNodes.parentId),
          eq(domainNodes.name, "Cloud Computing"),
        ),
      )
      .limit(1)
  )[0];

  if (!aws || !cloudComputing) {
    return;
  }

  const existingLink = (
    await db
      .select({ id: domainNodeLinks.id })
      .from(domainNodeLinks)
      .where(
        and(
          eq(domainNodeLinks.fromNodeId, aws.id),
          eq(domainNodeLinks.toNodeId, cloudComputing.id),
          eq(domainNodeLinks.kind, "also_in"),
        ),
      )
      .limit(1)
  )[0];

  if (existingLink) {
    return;
  }

  await db.insert(domainNodeLinks).values({
    id: newId("dnlink"),
    fromNodeId: aws.id,
    toNodeId: cloudComputing.id,
    kind: "also_in",
  });
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
  const prerequisiteState: PrerequisiteSeedState = {
    yamlIdToNodeId: new Map(),
    pendingNodes: [],
  };

  for (const [index, node] of taxonomy.entries()) {
    await seedNode(db, subjectId, null, node, node.order ?? index, result, prerequisiteState);
  }

  await seedAwsCloudComputingLink(db, subjectId);
  await seedPrerequisiteEdges(db, prerequisiteState);

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
