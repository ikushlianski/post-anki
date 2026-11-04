import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `stale_generating_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const DATABASE_URL = url.toString();
const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });

await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { failStaleGeneratingLectures, startGeneratingLecture, getLectureByTopic } = await import(
  "./lecture.repo.js"
);
const { failStaleGeneratingStudyMaterials, insertGeneratingStudyMaterial, listStudyMaterialsForTopic } =
  await import("../study-material/study-material.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await client?.end();
  await closeDb();
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

describe("stale generating sweep", () => {
  it("should fail a lecture stuck generating but leave a fresh one alone", async () => {
    const stuck = `top_${randomUUID()}`;
    const fresh = `top_${randomUUID()}`;

    await startGeneratingLecture(stuck, "Stuck");
    await startGeneratingLecture(fresh, "Fresh");
    await client.query(`UPDATE lectures SET updated_at = now() - interval '1 hour' WHERE topic_id = $1`, [stuck]);

    expect(await failStaleGeneratingLectures(stuck)).toBe(1);
    expect(await failStaleGeneratingLectures(fresh)).toBe(0);
    expect((await getLectureByTopic(stuck))?.status).toBe("failed");
    expect((await getLectureByTopic(fresh))?.status).toBe("generating");
  });

  it("should restart the clock when a lecture is regenerated", async () => {
    const topicId = `top_${randomUUID()}`;

    await startGeneratingLecture(topicId, "Old");
    await client.query(`UPDATE lectures SET updated_at = now() - interval '1 hour' WHERE topic_id = $1`, [topicId]);
    await startGeneratingLecture(topicId, "Again");

    expect(await failStaleGeneratingLectures(topicId)).toBe(0);
  });

  it("should fail a study material stuck generating with a reason", async () => {
    const topicId = `top_${randomUUID()}`;
    const material = await insertGeneratingStudyMaterial(topicId, "summary" as never);

    await client.query(`UPDATE study_materials SET created_at = now() - interval '1 hour' WHERE id = $1`, [
      material.id,
    ]);

    expect(await failStaleGeneratingStudyMaterials(topicId)).toBe(1);

    const [listed] = await listStudyMaterialsForTopic(topicId);

    expect(listed?.status).toBe("failed");
    expect(listed?.failureReason).toBe("generation_timed_out");
  });
});
