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
          yamlId: "networking",
          children: [
            {
              name: "TCP/IP",
              description: "The internet protocol suite",
              yamlId: "tcp-ip",
              children: [
                {
                  name: "DNS",
                  description: "Domain name system",
                  yamlId: "dns",
                  prerequisiteYamlIds: ["tcp-ip"],
                },
              ],
            },
          ],
        },
        { name: "Databases", yamlId: "databases" },
      ]);
    });

    it("carries yamlId through onto every node that declares an id", () => {
      const result = parseTaxonomyYaml(yamlText);

      for (const root of result) {
        expect(root.yamlId).toBeTypeOf("string");

        for (const child of root.children ?? []) {
          expect(child.yamlId).toBeTypeOf("string");
        }
      }
    });

    it("omits prerequisiteYamlIds on a node whose prerequisites list is empty", () => {
      const result = parseTaxonomyYaml(yamlText);

      expect(result[0]).not.toHaveProperty("prerequisiteYamlIds");
      expect(result[0]!.children![0]).not.toHaveProperty("prerequisiteYamlIds");
    });

    it("carries prerequisiteYamlIds through onto a node with a non-empty prerequisites list", () => {
      const result = parseTaxonomyYaml(yamlText);

      const dns = result[0]!.children![0]!.children![0]!;

      expect(dns.prerequisiteYamlIds).toEqual(["tcp-ip"]);
    });
  });

  describe("given nodes that declare a kind", () => {
    const yamlText = `
domains:
  - id: web-development
    name: Web Development
    children:
      - id: aws
        name: AWS
        kind: sub_subject
        children:
          - id: aws-compute
            name: Compute
            description: Lambda, Fargate/ECS, EC2, App Runner
            kind: area
`;

    it("carries kind through onto every node that declares one", () => {
      const result = parseTaxonomyYaml(yamlText);

      expect(result).toEqual([
        {
          name: "Web Development",
          yamlId: "web-development",
          children: [
            {
              name: "AWS",
              kind: "sub_subject",
              yamlId: "aws",
              children: [
                {
                  name: "Compute",
                  description: "Lambda, Fargate/ECS, EC2, App Runner",
                  kind: "area",
                  yamlId: "aws-compute",
                },
              ],
            },
          ],
        },
      ]);
    });

    it("leaves kind absent on a node that does not declare one", () => {
      const result = parseTaxonomyYaml(yamlText);

      expect(result[0]).not.toHaveProperty("kind");
    });

    it("leaves kind absent on every node of the base taxonomy", () => {
      const yamlWithoutKind = `
domains:
  - id: networking
    name: Networking
    children:
      - id: tcp-ip
        name: TCP/IP
`;

      const result = parseTaxonomyYaml(yamlWithoutKind);

      expect(result[0]).not.toHaveProperty("kind");
      expect(result[0]!.children![0]).not.toHaveProperty("kind");
    });
  });

  describe("given nodes that declare an order", () => {
    const yamlText = `
domains:
  - id: web-development
    name: Web Development
    children:
      - id: frontend-development
        name: Frontend Development
        children:
          - id: react
            name: React
            order: 3
`;

    it("carries order through onto the node that declares it", () => {
      const result = parseTaxonomyYaml(yamlText);

      const frontend = result[0]!.children![0]!;

      expect(frontend.children![0]!.order).toBe(3);
    });

    it("leaves order absent on a node that does not declare one", () => {
      const result = parseTaxonomyYaml(yamlText);

      expect(result[0]).not.toHaveProperty("order");
      expect(result[0]!.children![0]).not.toHaveProperty("order");
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

    // SCENARIO 14 (.planning/learning-paths/scenarios.md) — cloud-computing
    // is a root domain declared well after networking (an earlier root),
    // and its prerequisites name reference that earlier-declared node. This
    // pins the raw parser output the two-pass seed step depends on.
    it("carries the real taxonomy's cross-branch prerequisite ids through, order-independent", () => {
      const yamlText = readFileSync(REAL_TAXONOMY_PATH, "utf8");

      const result = parseTaxonomyYaml(yamlText);

      const cloudComputing = result.find((root) => root.yamlId === "cloud-computing");

      expect(cloudComputing?.prerequisiteYamlIds).toEqual([
        "networking",
        "virtualization-containerization",
      ]);
    });
  });
});
