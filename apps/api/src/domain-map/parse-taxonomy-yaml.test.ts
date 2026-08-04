import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTaxonomyYaml } from "./parse-taxonomy-yaml.js";

// seed-static-taxonomy (#82 follow-up) — SCENARIO 1 and SCENARIO 4
// (.planning/unassigned/seed-static-taxonomy/scenarios.md).

const REAL_TAXONOMY_PATH = new URL(
  "../../scripts/seed-data/it-taxonomy.yaml",
  import.meta.url,
);

function countNodes(nodes: { children?: unknown[] }[]): number {
  let total = 0;

  for (const node of nodes) {
    total += 1;
    total += countNodes((node.children as { children?: unknown[] }[] | undefined) ?? []);
  }

  return total;
}

function maxDepth(nodes: { children?: unknown[] }[], depth: number): number {
  let deepest = depth;

  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      deepest = Math.max(
        deepest,
        maxDepth(node.children as { children?: unknown[] }[], depth + 1),
      );
    }
  }

  return deepest;
}

describe("parseTaxonomyYaml", () => {
  describe("given a well-formed nested document", () => {
    const yamlText = `
domains:
  - id: networking
    name: Networking
    description: Network fundamentals
    prerequisites: []
    children:
      - id: tcp-ip
        name: TCP/IP
        description: The internet protocol suite
        prerequisites: []
        children:
          - id: dns
            name: DNS
            description: Domain name system
            prerequisites: [tcp-ip]
  - id: databases
    name: Databases
    prerequisites: []
`;

    it("parses the full nested structure into the SeedNode shape", () => {
      const result = parseTaxonomyYaml(yamlText);

      expect(result).toEqual([
        {
          name: "Networking",
          description: "Network fundamentals",
          children: [
            {
              name: "TCP/IP",
              description: "The internet protocol suite",
              children: [{ name: "DNS", description: "Domain name system" }],
            },
          ],
        },
        { name: "Databases" },
      ]);
    });

    it("drops the id and prerequisites fields from every node", () => {
      const result = parseTaxonomyYaml(yamlText);

      for (const root of result) {
        expect(root).not.toHaveProperty("id");
        expect(root).not.toHaveProperty("prerequisites");

        for (const child of root.children ?? []) {
          expect(child).not.toHaveProperty("id");
          expect(child).not.toHaveProperty("prerequisites");
        }
      }
    });
  });

  describe("given a document with duplicate sibling names", () => {
    it("throws naming the duplicate and its parent when two root domains collide", () => {
      const yamlText = `
domains:
  - id: networking
    name: Networking
  - id: networking-2
    name: Networking
`;

      expect(() => parseTaxonomyYaml(yamlText)).toThrow(/Networking/);
      expect(() => parseTaxonomyYaml(yamlText)).toThrow(/<root>/);
    });

    it("throws naming the duplicate and its parent when two children under the same node collide", () => {
      const yamlText = `
domains:
  - id: networking
    name: Networking
    children:
      - id: tcp-ip
        name: TCP/IP
      - id: tcp-ip-2
        name: TCP/IP
`;

      expect(() => parseTaxonomyYaml(yamlText)).toThrow(/TCP\/IP/);
      expect(() => parseTaxonomyYaml(yamlText)).toThrow(/Networking/);
    });

    it("does not throw for the same name repeated under two different parents", () => {
      const yamlText = `
domains:
  - id: networking
    name: Networking
    children:
      - id: fundamentals-net
        name: Fundamentals
  - id: databases
    name: Databases
    children:
      - id: fundamentals-db
        name: Fundamentals
`;

      expect(() => parseTaxonomyYaml(yamlText)).not.toThrow();
    });
  });

  describe("given the real taxonomy shipped by #83", () => {
    it("parses without throwing and matches the known 208-node, 15-root, 3-level shape", () => {
      const yamlText = readFileSync(REAL_TAXONOMY_PATH, "utf8");

      const result = parseTaxonomyYaml(yamlText);

      expect(result).toHaveLength(15);
      expect(countNodes(result)).toBe(208);
      expect(maxDepth(result, 1)).toBe(3);
    });
  });
});
