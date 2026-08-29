import process from "node:process";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { subjects } from "../src/db/schema.ts";
import { newId } from "../src/shared/id.ts";

// Starting-point taxonomy derived from the user's own Anki deck hierarchy
// (429 decks, exported read-only 2026-07-18). Subjects only — no curricula/
// courses are seeded here, since real course content goes through the
// trusted-source approval flow (grounded-knowledge-map), not a static seed.
// See GitHub issue #48 for the full proposal and its excluded decks
// (!WORK, Masha, По умолчанию, dm.by).
const SEED_SUBJECTS = [
  {
    name: "Programming / Web Development",
    description:
      "Frontend, backend, cloud, data, and devops — the largest and most active learning area.",
  },
  { name: "Business", description: "Marketing, sales, finance, HR, legal fundamentals." },
  { name: "Investing", description: "Crypto, macro, and trading." },
  { name: "English", description: "Everyday conversational and work/tech-context English." },
  { name: "Polish", description: "Grammar, vocabulary, and daily-life Polish." },
  { name: "Spanish", description: "Beginner Spanish." },
  { name: "Swedish", description: "Swedish, not yet started." },
  { name: "Music", description: "Piano." },
  {
    name: "Databases",
    description: "Postgres, data modeling, and storage systems — split out as its own subject.",
  },
  {
    name: "Architecture",
    description: "System design, service boundaries, and architectural decision-making.",
  },
  {
    name: "Cloud Computing",
    description: "AWS/GCP infrastructure, deployment, and cloud-native patterns.",
  },
  {
    name: "AI",
    description: "AI/ML systems, LLMs, and applied AI engineering.",
  },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed subjects");
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  let created = 0;
  let skipped = 0;

  for (const subject of SEED_SUBJECTS) {
    const existing = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(eq(subjects.name, subject.name))
      .limit(1);

    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    await db.insert(subjects).values({
      id: newId("sub"),
      name: subject.name,
      description: subject.description,
    });
    created += 1;
  }

  await pool.end();
  console.log(`subjects seeded: ${created} created, ${skipped} already present`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
