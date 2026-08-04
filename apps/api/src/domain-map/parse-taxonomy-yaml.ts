import { parse } from "yaml";

// seed-static-taxonomy (#82 follow-up to #84) — turns the raw YAML text of
// #83's design-knowledge-taxonomy output into the same SeedNode[] shape
// seed-domain-taxonomy.ts's existing seedNode/seedDomainTaxonomy functions
// already consume (built during #84 against a small in-file placeholder).
// `id` and `prerequisites` fields from the source YAML are dropped —
// domain_nodes has no column for either, and #83's own architecture.md
// calls prerequisites "informational, not enforced" with no schema support.
export interface SeedNode {
  name: string;
  description?: string;
  children?: SeedNode[];
}

interface RawTaxonomyNode {
  id: string;
  name: string;
  description?: string;
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
