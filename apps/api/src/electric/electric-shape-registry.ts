interface ShapeDefinition {
  table: string;
  columns?: string[];
  where?: string;
}

// Electric's own auth guide is explicit that table/where/columns must be set
// server-side, because the proxy is the authorization layer that decides what a
// client is allowed to sync. Anything not listed here is unreachable.
//
// learning-list-fold-in — `curricula`'s `where` excludes container curricula
// (`container_area_node_id`, see schema.ts's own comment on that column) the
// same way `listCurricula()` (curriculum.repo.ts) already does for the
// REST-backed board/tree read paths. Without this, the Electric-synced board
// (apps/web/src/curriculum/board.collection.ts, the primary data source for
// the homepage once its live query is ready) would stream every container
// straight from Postgres, unfiltered — the one read path that isn't
// reachable through `listCurricula()` at all.
const SHAPE_REGISTRY = new Map<string, ShapeDefinition>([
  ["subjects", { table: "subjects" }],
  ["curricula", { table: "curricula", where: "container_area_node_id IS NULL" }],
  ["sources", { table: "sources", columns: ["id", "curriculum_id", "kind"] }],
  ["phrases", { table: "phrases" }],
  ["attempts", { table: "attempts" }],
  ["language_practice_settings", { table: "language_practice_settings" }],
  ["course_refocus_dismissals", { table: "course_refocus_dismissals" }],
]);

// Cursor/pagination/transport state that ShapeStream maintains across the
// long-poll cycle. Verified against @electric-sql/client 1.5.24 —
// dist/chunk-QLA7LEQI.mjs `constructUrl_fn` plus the `applyUrlParams`
// implementations on ActiveState/LiveState/StaleRetryState. None of these can
// widen which rows or columns a shape exposes. Deliberately excluded:
// `where`, `columns`, `params`, and every `subset__*` param, all of which are
// client-supplied filter/projection input.
const PASS_THROUGH_PARAMS = [
  "offset",
  "handle",
  "live",
  "cursor",
  "replica",
  "log",
  "cache-buster",
  "expired_handle",
  "live_sse",
  "experimental_live_sse",
] as const;

export type ShapeQueryResult =
  | { ok: true; query: string }
  | { ok: false; error: string; message: string };

export function buildElectricShapeQuery(search: string): ShapeQueryResult {
  const incoming = new URLSearchParams(search);
  const requestedTables = incoming.getAll("table");

  if (requestedTables.length > 1) {
    return {
      ok: false,
      error: "table_invalid",
      message: "exactly one table query parameter is allowed",
    };
  }

  const [requestedTable] = requestedTables;

  if (requestedTable === undefined) {
    return {
      ok: false,
      error: "table_required",
      message: "a table query parameter is required",
    };
  }

  const definition = SHAPE_REGISTRY.get(requestedTable);

  if (!definition) {
    return {
      ok: false,
      error: "table_not_allowed",
      message: `table is not exposed for sync: ${requestedTable}`,
    };
  }

  const outgoing = new URLSearchParams();

  outgoing.set("table", definition.table);

  if (definition.columns) {
    outgoing.set("columns", definition.columns.join(","));
  }

  if (definition.where) {
    outgoing.set("where", definition.where);
  }

  for (const param of PASS_THROUGH_PARAMS) {
    const value = incoming.get(param);

    if (value !== null) {
      outgoing.set(param, value);
    }
  }

  return { ok: true, query: `?${outgoing.toString()}` };
}
