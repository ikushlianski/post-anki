import { describe, expect, it } from "vitest";
import { buildElectricShapeQuery } from "./electric-shape-registry.js";

describe("buildElectricShapeQuery — curricula shape", () => {
  it("excludes container curricula from the synced board", () => {
    const result = buildElectricShapeQuery("?table=curricula");

    expect(result.ok).toBe(true);
    expect((result as { ok: true; query: string }).query).toContain(
      "where=container_area_node_id+IS+NULL",
    );
  });

  it("never lets a client override the server-set where clause", () => {
    const result = buildElectricShapeQuery("?table=curricula&where=1%3D1");

    expect(result.ok).toBe(true);

    const params = new URLSearchParams((result as { ok: true; query: string }).query.slice(1));

    expect(params.get("where")).toBe("container_area_node_id IS NULL");
  });
});

describe("buildElectricShapeQuery — shapes without a where clause", () => {
  it("omits the where param entirely for subjects", () => {
    const result = buildElectricShapeQuery("?table=subjects");

    expect(result.ok).toBe(true);

    const params = new URLSearchParams((result as { ok: true; query: string }).query.slice(1));

    expect(params.has("where")).toBe(false);
  });

  it("still projects sources down to its allowed columns", () => {
    const result = buildElectricShapeQuery("?table=sources");

    expect(result.ok).toBe(true);
    expect((result as { ok: true; query: string }).query).toContain("columns=id%2Ccurriculum_id%2Ckind");
  });
});
