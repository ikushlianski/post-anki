import { describe, expect, it } from "vitest";
import { loadTaxonomy } from "../../scripts/seed-domain-taxonomy.js";
import type { SeedNode } from "./parse-taxonomy-yaml.js";

// learning-list-intake — the fixed React / Node.js / AWS Areas
// (.planning/learning-list-intake/web-development-areas.md) are the contract
// this file pins: exactly 10 named Areas + "Other" per sub-subject, no
// eleventh, no reordering, no invented Area. "Other" filling up is the human
// signal to revisit the design doc; a test drifting is not.
//
// Co-located under src/domain-map/ rather than next to the script itself
// because apps/api/vitest.config.ts's include glob is `src/**/*.test.ts`
// only — the same fact seed-domain-taxonomy.integration.test.ts documents.

const REACT_AREAS = [
  "Components, JSX & Props",
  "Rendering Logic & Purity",
  "State Fundamentals",
  "State Architecture",
  "Reducers & Context",
  "Effects & Synchronization",
  "Refs & DOM Escape Hatches",
  "Custom Hooks & Logic Reuse",
  "Performance & Concurrent Rendering",
  "Server Components & Data Loading",
];

const NODEJS_AREAS = [
  "Runtime & Module System",
  "Async Model & Event Loop",
  "Streams & Backpressure",
  "Filesystem & Paths",
  "HTTP & Networking",
  "Processes, Concurrency & Workers",
  "Packages & Publishing",
  "TypeScript in Node",
  "Testing",
  "Diagnostics & Performance",
];

const AWS_AREAS = [
  "Identity & Access",
  "Compute",
  "Storage",
  "Databases",
  "Networking & Delivery",
  "Messaging & Events",
  "Observability",
  "IaC & Deployment",
  "Cost & Capacity",
  "AI/ML Services",
];

function findByPath(roots: SeedNode[], path: string[]): SeedNode | undefined {
  let level = roots;
  let found: SeedNode | undefined;

  for (const name of path) {
    found = level.find((node) => node.name === name);

    if (!found) {
      return undefined;
    }

    level = found.children ?? [];
  }

  return found;
}

function flatten(nodes: SeedNode[]): SeedNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}

describe("loadTaxonomy", () => {
  const taxonomy = loadTaxonomy();
  // The concatenated forest carries "Web Development" TWICE — once as the
  // base taxonomy's own root, once as the overlay's name-only scaffold — so
  // every lookup below starts from the overlay explicitly. The seed script
  // collapses the two by name at insert time; a name search over the whole
  // forest would silently find the base one instead.
  const overlay = taxonomy[taxonomy.length - 1]!;

  describe("given both seed files", () => {
    it("keeps the base taxonomy's 15 roots and appends the web-dev overlay after them", () => {
      const roots = taxonomy.map((node) => node.name);

      expect(roots.slice(0, 15)).toHaveLength(15);
      expect(roots.slice(15)).toEqual(["Web Development"]);
    });

    it("re-declares the overlay scaffold by name only so the seed resolves it to existing rows", () => {
      expect(overlay).not.toHaveProperty("kind");
      expect(overlay).not.toHaveProperty("description");

      const frontend = findByPath([overlay], ["Web Development", "Frontend Development"]);
      const backend = findByPath([overlay], ["Web Development", "Backend Development"]);

      expect(frontend).not.toHaveProperty("kind");
      expect(frontend).not.toHaveProperty("description");
      expect(backend).not.toHaveProperty("kind");
      expect(backend).not.toHaveProperty("description");
    });

    it("leaves every node of the base taxonomy without a kind", () => {
      const baseNodes = flatten(taxonomy.slice(0, 15));

      expect(baseNodes.every((node) => node.kind === undefined)).toBe(true);
    });
  });

  describe.each([
    { label: "React", path: ["Web Development", "Frontend Development", "React"], areas: REACT_AREAS },
    { label: "Node.js", path: ["Web Development", "Backend Development", "Node.js"], areas: NODEJS_AREAS },
    { label: "AWS", path: ["Web Development", "AWS"], areas: AWS_AREAS },
  ])("given the $label sub-subject", ({ path, areas }) => {
    it("is placed at its documented parent and marked as a sub-subject", () => {
      const subSubject = findByPath([overlay], path);

      expect(subSubject).toBeDefined();
      expect(subSubject!.kind).toBe("sub_subject");
    });

    it("has exactly the 10 documented Areas plus Other, in order", () => {
      const subSubject = findByPath([overlay], path)!;
      const children = subSubject.children ?? [];

      expect(children).toHaveLength(11);
      expect(children.map((child) => child.name)).toEqual([...areas, "Other"]);
    });

    it("marks every Area with kind area and gives each a non-empty description", () => {
      const subSubject = findByPath([overlay], path)!;

      for (const area of subSubject.children ?? []) {
        expect(area.kind).toBe("area");
        expect(area.description ?? "").not.toBe("");
        expect(area.children).toBeUndefined();
      }
    });

    it("declares no Area for a cross-cutting concern", () => {
      const subSubject = findByPath([overlay], path)!;
      const names = (subSubject.children ?? []).map((child) => child.name.toLowerCase());

      expect(names).not.toContain("security");
      expect(names).not.toContain("reliability");
    });
  });

  // lms-buildout 0.8 — seedNode() (seed-domain-taxonomy.ts) otherwise derives
  // order from each node's index within THIS file's own local children
  // array, which starts back at 0 for React/Node.js/AWS because each is the
  // lone child in its copy of an already-seeded parent — colliding with the
  // real sibling it-taxonomy.yaml already gave that same order (html-css-js,
  // web-frameworks, web-standards, all order 0/2 respectively). An explicit
  // `order` on these three nodes is what avoids that collision.
  describe("given the sibling collisions the fixed sub-subjects otherwise cause", () => {
    it("gives React an order past frontend-development's 3 existing it-taxonomy siblings", () => {
      const react = findByPath([overlay], [
        "Web Development",
        "Frontend Development",
        "React",
      ])!;

      expect(react.order).toBe(3);
    });

    it("gives Node.js an order past backend-development's 3 existing it-taxonomy siblings", () => {
      const nodejs = findByPath([overlay], [
        "Web Development",
        "Backend Development",
        "Node.js",
      ])!;

      expect(nodejs.order).toBe(3);
    });

    it("gives AWS an order past web-development's 4 existing it-taxonomy siblings", () => {
      const aws = findByPath([overlay], ["Web Development", "AWS"])!;

      expect(aws.order).toBe(4);
    });
  });
});
