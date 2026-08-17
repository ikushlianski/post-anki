import { parse } from "yaml";

// seed-static-taxonomy (#82 follow-up to #84) — turns the raw YAML text of
// #83's design-knowledge-taxonomy output into the same SeedNode[] shape
// seed-domain-taxonomy.ts's existing seedNode/seedDomainTaxonomy functions
// already consume (built during #84 against a small in-file placeholder).
//
// learning-list-intake adds one carried field, `kind` ("sub_subject" |
// "area"), for web-dev-areas.yaml. It stays OPTIONAL rather than becoming
// required: every node in it-taxonomy.yaml is ordinary taxonomy and must
// keep parsing to a kind-less SeedNode, which is exactly what
// domain_nodes.kind's own nullability means.
//
// lms-buildout 0.8 adds a second optional field, `order`. seedNode()
// (seed-domain-taxonomy.ts) otherwise assigns order from a node's index
// within its OWN file's local children array — fine for it-taxonomy.yaml,
// where every sibling is declared together, but wrong for web-dev-areas.yaml,
// which adds React/Node.js/AWS as the lone child in ITS copy of an
// already-seeded parent (e.g. frontend-development), so the local index
// always starts back at 0 and collides with siblings it-taxonomy.yaml
// already gave that same order. An explicit `order` overrides the index for
// exactly those collision cases; every other node stays index-derived.
//
// learning-paths (module 1) revives the two fields the original comment
// here used to drop, `id` and `prerequisites` — #83's it-taxonomy.yaml has
// carried them since #83, but domain_nodes had no column for either until
// domain_node_prerequisites landed. `yamlId` mirrors `id` 1:1 (present
// whenever the raw node declares one). `prerequisiteYamlIds` mirrors
// `prerequisites`, but — like `children` above — is only set when the list
// is non-empty; every node in it-taxonomy.yaml declares `prerequisites: []`
// explicitly, and carrying an empty array through on all 208 of them would
// be pure noise for zero behavioral gain (resolveTaxonomyPrerequisiteEdges
// treats "absent" and "empty" identically). Both fields are consumed by
// seed-domain-taxonomy.ts's two-pass edge-seeding step, never by
// seedNode()'s node-insertion pass itself.
export interface SeedNode {
  name: string;
  description?: string;
  kind?: string;
  order?: number;
  yamlId?: string;
  prerequisiteYamlIds?: string[];
  children?: SeedNode[];
}

interface RawTaxonomyNode {
  id: string;
  name: string;
  description?: string;
  kind?: string;
  order?: number;
  prerequisites?: string[];
  children?: RawTaxonomyNode[];
}

interface RawTaxonomyDocument {
  domains: RawTaxonomyNode[];
}

function toSeedNode(raw: RawTaxonomyNode, parentPath: string): SeedNode {
  const path = parentPath === "" ? raw.name : `${parentPath} > ${raw.name}`;
  const children = raw.children ?? [];

  const seenNames = new Set<string>();

  for (const child of children) {
    if (seenNames.has(child.name)) {
      throw new Error(
        `parseTaxonomyYaml: duplicate sibling name "${child.name}" under parent "${path}"`,
      );
    }

    seenNames.add(child.name);
  }

  const seedNode: SeedNode = { name: raw.name };

  if (raw.description !== undefined) {
    seedNode.description = raw.description;
  }

  if (raw.kind !== undefined) {
    seedNode.kind = raw.kind;
  }

  if (raw.order !== undefined) {
    seedNode.order = raw.order;
  }

  if (raw.id !== undefined) {
    seedNode.yamlId = raw.id;
  }

  if (raw.prerequisites !== undefined && raw.prerequisites.length > 0) {
    seedNode.prerequisiteYamlIds = raw.prerequisites;
  }

  if (children.length > 0) {
    seedNode.children = children.map((child) => toSeedNode(child, path));
  }

  return seedNode;
}

export function parseTaxonomyYaml(yamlText: string): SeedNode[] {
  const document = parse(yamlText) as RawTaxonomyDocument;

  const roots = document.domains ?? [];
  const seenRootNames = new Set<string>();

  for (const root of roots) {
    if (seenRootNames.has(root.name)) {
      throw new Error(
        `parseTaxonomyYaml: duplicate sibling name "${root.name}" under parent "<root>"`,
      );
    }

    seenRootNames.add(root.name);
  }

  return roots.map((root) => toSeedNode(root, ""));
}
