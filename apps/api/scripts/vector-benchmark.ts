import pg from "pg";
import { assertLocalDbTarget } from "../src/db/assert-local-db-target.js";

// Run against a throwaway local DB only: DATABASE_URL=postgres://...@localhost:5562/<db> N=100 tsx scripts/vector-benchmark.ts
const url = process.env.DATABASE_URL;
assertLocalDbTarget(url);
const RUNS = Number(process.env.RUNS ?? 100);
const SAMPLE = Number(process.env.SAMPLE ?? 30);
const pool = new pg.Pool({ connectionString: url, max: 1 });
const lit = (v: number[]) => `[${v.join(",")}]`;
const rnd = (d: number) => {
  const v = Array.from({ length: d }, () => Math.random() * 2 - 1);
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));

  return v.map((x) => x / n);
};
const stored: number[][] = [];
const EFS = (process.env.EFS ?? "40,100").split(",").map(Number);
const NEAR = process.env.NEAR === "1";
const qv = (d = 1536) => {
  const b = stored.length ? stored[Math.floor(Math.random() * stored.length)]!.slice(0, d) : [];
  const v = b.length ? b.map((x) => x + (Math.random() * 2 - 1) * 0.02) : rnd(d);
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0));

  return v.map((x) => x / n);
};
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]!;
const ms = (x: number) => x.toFixed(2);

async function q(sql: string, params: unknown[] = [], ef = 40, set = "") {
  const c = await pool.connect();

  try {
    await c.query("BEGIN");
    await c.query(`SET LOCAL hnsw.ef_search = ${ef}`);
    if (set) await c.query(set);
    const r = await c.query(sql, params);

    await c.query("COMMIT");

    return r;
  } finally {
    c.release();
  }
}

async function lat(name: string, sql: string, mk: () => unknown[], ef = 40) {
  const t: number[] = [];
  let rows = 0;

  for (let i = 0; i < RUNS + 10; i++) {
    const s = performance.now();
    const r = await q(sql, mk(), ef);

    if (i >= 10) {
      t.push(performance.now() - s);
      rows = r.rows.length;
    }
  }

  console.log(`LAT | ${name} | ef ${ef} | p50 ${ms(pct(t, 0.5))} | p95 ${ms(pct(t, 0.95))} | rows ${rows}`);
}

async function recall(name: string, tbl: string, col: string, cast: string, ef: number) {
  const k = 10;
  let hit = 0;

  for (let i = 0; i < SAMPLE; i++) {
    const v = qv();
    const truth = await q(`SELECT id FROM knowledge_bits ORDER BY embedding_vec <=> $1 LIMIT ${k}`, [lit(v)], 40, "SET LOCAL enable_indexscan = off");
    const ids = truth.rows.map((r) => r.id);
    const got = await q(`SELECT id FROM ${tbl} ORDER BY ${col} <=> $1${cast} LIMIT ${k}`, [lit(v)], ef, "SET LOCAL enable_seqscan = off");

    hit += got.rows.filter((r) => ids.includes(r.id)).length;
  }

  console.log(`RECALL | ${name} | k ${k} | ef ${ef} | ${(hit / (SAMPLE * k)).toFixed(3)}`);
}

async function plan(name: string, sql: string, params: unknown[], ef = 40) {
  const r = await q(`EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF) ${sql}`, params, ef);
  const txt = r.rows.map((x) => x["QUERY PLAN"]).join("\n").replace(/\[[-0-9.,e]{50,}\]/g, "[vec]");

  console.log(`PLAN | ${name} | uses hnsw: ${/hnsw/i.test(txt)}\n${txt}`);
}

const sizes = await pool.query(`SELECT c.relname, pg_total_relation_size(c.oid) total, pg_relation_size(c.oid) rel, pg_relation_size(c.reltoastrelid) toast FROM pg_class c WHERE c.relname IN ('knowledge_bits','knowledge_bit_question_variants','topic_card_variants','facts') OR c.relname LIKE '%hnsw_idx' ORDER BY 1`);

for (const r of sizes.rows) console.log(`SIZE | ${r.relname} | total ${(r.total / 1e6).toFixed(1)}MB | heap/index ${(r.rel / 1e6).toFixed(1)}MB | toast ${(r.toast / 1e6).toFixed(1)}MB`);

if (NEAR) for (const r of (await pool.query("SELECT embedding_vec::text t FROM knowledge_bits ORDER BY random() LIMIT 50")).rows) stored.push(JSON.parse(r.t));

const sub = (await pool.query(`SELECT subject_id FROM knowledge_sources LIMIT 1`)).rows[0]?.subject_id as string;
const bitSql = `SELECT id, body, 1 - (embedding_vec <=> $1) s FROM knowledge_bits WHERE embedding_vec IS NOT NULL AND approval_state='approved'`;
const subSql = `${bitSql} AND knowledge_source_id IN (SELECT id FROM knowledge_sources WHERE subject_id = $2) ORDER BY embedding_vec <=> $1 LIMIT 10`;
const joinSql = `SELECT v.id, t.title FROM topic_card_variants v JOIN topic_cards c ON v.card_id=c.id JOIN topic_card_sets s ON c.card_set_id=s.id JOIN topics t ON s.topic_id=t.id WHERE v.embedding_vec IS NOT NULL ORDER BY v.embedding_vec <=> $1 LIMIT 10`;

await lat("bits", `${bitSql} ORDER BY embedding_vec <=> $1 LIMIT 10`, () => [lit(qv())]);
await lat("bits+subject", subSql, () => [lit(qv()), sub], 400);
await lat("card variants join", joinSql, () => [lit(qv())]);
await plan("bits", `${bitSql} ORDER BY embedding_vec <=> $1 LIMIT 10`, [lit(qv())]);
await plan("bits+subject (ef 400)", subSql, [lit(qv()), sub], 400);
await plan("card variants join", joinSql, [lit(qv())]);

const forced = await q(subSql, [lit(qv()), sub], 400, "SET LOCAL enable_seqscan = off");

console.log(`SUBJECT-HNSW-FORCED | rows ${forced.rows.length} of 10`);

for (const ef of EFS) await recall("vector(1536)", "knowledge_bits", "embedding_vec", "", ef);

await pool.query("DROP TABLE IF EXISTS bench_half; DROP TABLE IF EXISTS bench_512");
await pool.query(`CREATE TABLE bench_half AS SELECT id, embedding_vec::halfvec(1536) v FROM knowledge_bits`);
await pool.query(`CREATE TABLE bench_512 AS SELECT id, l2_normalize(subvector(embedding_vec,1,512))::vector(512) v FROM knowledge_bits`);
await pool.query(`CREATE INDEX bench_half_i ON bench_half USING hnsw (v halfvec_cosine_ops)`);
await pool.query(`CREATE INDEX bench_512_i ON bench_512 USING hnsw (v vector_cosine_ops)`);
await pool.query("VACUUM ANALYZE bench_half");
await pool.query("VACUUM ANALYZE bench_512");
const alt = await pool.query(`SELECT relname, pg_total_relation_size(oid) t, pg_relation_size(oid) r FROM pg_class WHERE relname IN ('bench_half','bench_512','bench_half_i','bench_512_i')`);

for (const r of alt.rows) console.log(`SIZE | ${r.relname} | total ${(r.t / 1e6).toFixed(1)}MB | rel ${(r.r / 1e6).toFixed(1)}MB`);

await lat("halfvec(1536)", `SELECT id FROM bench_half ORDER BY v <=> $1::halfvec(1536) LIMIT 10`, () => [lit(qv())]);
await lat("vector(512)", `SELECT id FROM bench_512 ORDER BY v <=> $1::vector(512) LIMIT 10`, () => [lit(rnd(512))]);

for (const ef of EFS) await recall("halfvec(1536) vs float32 truth", "bench_half", "v", "::halfvec(1536)", ef);

await pool.query("DROP TABLE bench_half; DROP TABLE bench_512");
console.log("done");
await pool.end();
