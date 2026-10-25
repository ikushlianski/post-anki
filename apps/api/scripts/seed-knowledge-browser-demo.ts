import process from "node:process";
import pg from "pg";
import { embeddingFor } from "../../../scripts/lib/mock-llm.mjs";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCAL_PORT = "5562";
const LOCAL_DB = "postanki_dev";
const DIM = 1536;
const DAY_MS = 86_400_000;

type Kind = "manual" | "pasted" | "notion" | "article" | "ai";
type Study = "new" | "learning" | "review" | "relearning" | "suspended" | "buried";

interface Piece {
  subject: "prog" | "ts" | "common" | "lang" | "cook" | null;
  kind: Kind;
  front: string;
  back: string;
  daysAgo: number;
  study?: Study;
  url?: string;
  group?: string;
  noMeaning?: boolean;
}

export function assertLocalDevTarget(connectionString: string | undefined): void {
  const refusal = "refusing to seed: DATABASE_URL must be the local dev database (localhost:5562/postanki_dev)";

  if (!connectionString) throw new Error(refusal);

  let url: URL;

  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(refusal);
  }

  if (!LOCAL_HOSTS.has(url.hostname) || url.port !== LOCAL_PORT || url.pathname !== `/${LOCAL_DB}`) {
    throw new Error(refusal);
  }
}

const WIKI = "https://en.wikipedia.org/wiki";
const PIECES: Piece[] = [
  { subject: "ts", kind: "manual", front: "What does the unknown type force you to do?", back: "Narrow the value before using it.", daysAgo: 2, study: "review" },
  { subject: "ts", kind: "manual", front: "What is a discriminated union?", back: "A union whose members share a literal tag field.", daysAgo: 9, study: "learning" },
  { subject: "ts", kind: "pasted", front: "What does satisfies check?", back: "That a value fits a type without widening it.", daysAgo: 15 },
  { subject: "ts", kind: "article", front: "Why prefer readonly arrays in props?", back: "They stop accidental mutation of shared data.", daysAgo: 21, url: "https://blog.example.dev/readonly-arrays", study: "review" },
  { subject: "prog", kind: "pasted", front: "What is idempotence?", back: "Repeating an operation gives the same result.", daysAgo: 30 },
  { subject: "prog", kind: "notion", front: "What is a race condition?", back: "Outcome depends on the timing of concurrent steps.", daysAgo: 33, study: "relearning" },
  { subject: "prog", kind: "article", front: "What is the CAP theorem?", back: "A distributed store cannot give consistency, availability and partition tolerance together.", daysAgo: 40, url: `${WIKI}/CAP_theorem`, study: "suspended" },
  { subject: "prog", kind: "article", front: "What is a hash table?", back: "A map that finds values by hashing the key.", daysAgo: 44, url: "https://www.wikipedia.org/wiki/Hash_table" },
  { subject: "prog", kind: "ai", front: "What does HTTP 429 mean?", back: "Too many requests; slow down.", daysAgo: 4, url: "https://blog.example.dev/http-429" },
  { subject: "lang", kind: "manual", front: "Как будет «карточка» по-английски?", back: "Flashcard.", daysAgo: 1 },
  { subject: "lang", kind: "pasted", front: "Когда нужен артикль the?", back: "Когда собеседник знает, о каком предмете речь.", daysAgo: 12, study: "learning" },
  { subject: "lang", kind: "notion", front: "Что значит слово ephemeral?", back: "Недолговечный, живущий очень короткое время.", daysAgo: 25, study: "buried" },
  { subject: "lang", kind: "article", front: "What is the Oxford comma?", back: "A comma before the final and in a list.", daysAgo: 52, url: `${WIKI}/Serial_comma` },
  { subject: "lang", kind: "ai", front: "Spanish for good morning?", back: "Buenos días.", daysAgo: 6, study: "review" },
  { subject: "cook", kind: "manual", front: "Why rest dough after kneading?", back: "Gluten relaxes and shaping gets easier.", daysAgo: 3, study: "review" },
  { subject: "cook", kind: "pasted", front: "What does a sourdough starter contain?", back: "Wild yeast and bacteria fed with flour and water.", daysAgo: 18 },
  { subject: "cook", kind: "article", front: "What is the Maillard reaction?", back: "Browning of food from sugars reacting with amino acids.", daysAgo: 60, url: `${WIKI}/Maillard_reaction`, study: "review" },
  { subject: "cook", kind: "notion", front: "Salt ratio for brining a chicken?", back: "About 5 percent salt by weight of water.", daysAgo: 70 },
  { subject: null, kind: "manual", front: "Which planet has the most moons?", back: "Saturn.", daysAgo: 5 },
  { subject: null, kind: "pasted", front: "When did the Roman Republic become an empire?", back: "In 27 BC under Augustus.", daysAgo: 28, study: "new" },
  { subject: null, kind: "article", front: "What is a light-year?", back: "The distance light travels in one year.", daysAgo: 55, url: `${WIKI}/Light-year`, study: "learning" },
  { subject: null, kind: "ai", front: "Who built the Great Wall's Ming sections?", back: "The Ming dynasty rebuilt and extended it.", daysAgo: 14, study: "suspended" },
  { subject: null, kind: "notion", front: "Что такое чёрная дыра?", back: "Область, из которой не уходит даже свет.", daysAgo: 80 },
  { subject: "prog", kind: "pasted", front: "Source piece one: what is a queue?", back: "First in, first out.", daysAgo: 20, group: "queues" },
  { subject: "prog", kind: "pasted", front: "Source piece two: what is a stack?", back: "Last in, first out.", daysAgo: 20, group: "queues", study: "review" },
  { subject: "prog", kind: "pasted", front: "Source piece three: what is a deque?", back: "A queue open at both ends.", daysAgo: 20, group: "queues" },
  { subject: "prog", kind: "pasted", front: "Source piece four: what is a heap?", back: "A tree where parents outrank children.", daysAgo: 20, group: "queues", noMeaning: true },
  { subject: "prog", kind: "pasted", front: "Source piece five: what is a trie?", back: "A tree keyed by string prefixes.", daysAgo: 20, group: "queues" },
  { subject: "prog", kind: "pasted", front: "Source piece six: what is a graph?", back: "Nodes joined by edges.", daysAgo: 20, group: "queues", study: "learning" },
  { subject: "prog", kind: "pasted", front: "Source piece seven: what is BFS?", back: "Visit neighbours level by level.", daysAgo: 20, group: "queues" },
  { subject: "prog", kind: "pasted", front: "Source piece eight: what is DFS?", back: "Go deep before backtracking.", daysAgo: 20, group: "queues" },
  { subject: "ts", kind: "manual", front: "Что делает оператор keyof?", back: "Возвращает объединение ключей типа.", daysAgo: 7, noMeaning: true },
  { subject: "lang", kind: "manual", front: "Past tense of go?", back: "Went.", daysAgo: 8, noMeaning: true },
  { subject: "cook", kind: "manual", front: "Oven temperature for pizza?", back: "As hot as it goes, around 250 C.", daysAgo: 10, noMeaning: true },
  { subject: "common", kind: "manual", front: "What is a pure function?", back: "Same input, same output, no side effects.", daysAgo: 13 },
  { subject: "common", kind: "pasted", front: "What is memoization?", back: "Caching a function result by its arguments.", daysAgo: 16, study: "review" },
  { subject: "common", kind: "manual", front: "What is a closure?", back: "A function that keeps access to its defining scope.", daysAgo: 19, study: "learning" },
  { subject: null, kind: "manual", front: "Capital of Australia?", back: "Canberra.", daysAgo: 11, noMeaning: true },
];

const SUBJECTS = [
  { key: "prog", id: "subj_demo_prog", name: "Demo Programming", parent: null },
  { key: "ts", id: "subj_demo_ts", name: "Demo TypeScript", parent: "subj_demo_prog" },
  { key: "common", id: "subj_demo_common", name: "Common", parent: "subj_demo_prog" },
  { key: "lang", id: "subj_demo_lang", name: "Demo Languages", parent: null },
  { key: "cook", id: "subj_demo_cook", name: "Demo Cooking", parent: null },
];

function schedule(study: Study | undefined, now: number): { phase: string; suspended: Date | null; buried: Date | null } | null {
  if (!study || study === "new") return null;

  return {
    phase: study === "suspended" || study === "buried" ? "review" : study,
    suspended: study === "suspended" ? new Date(now) : null,
    buried: study === "buried" ? new Date(now + 3 * DAY_MS) : null,
  };
}

async function clearDemo(client: pg.Client): Promise<void> {
  await client.query(`DELETE FROM knowledge_bit_schedules WHERE knowledge_bit_id LIKE 'kb_demo_%'`);
  await client.query(`DELETE FROM knowledge_bit_question_variants WHERE knowledge_bit_id LIKE 'kb_demo_%'`);
  await client.query(`DELETE FROM knowledge_bits WHERE id LIKE 'kb_demo_%'`);
  await client.query(`DELETE FROM knowledge_sources WHERE id LIKE 'ksrc_demo_%'`);
  await client.query(`DELETE FROM subjects WHERE id LIKE 'subj_demo_%' AND parent_id IS NOT NULL`);
  await client.query(`DELETE FROM subjects WHERE id LIKE 'subj_demo_%'`);
}

async function insertPiece(client: pg.Client, piece: Piece, index: number, now: number): Promise<void> {
  const subject = SUBJECTS.find((s) => s.key === piece.subject)?.id ?? null;
  const sourceId = `ksrc_demo_${piece.group ?? index}`;
  const bitId = `kb_demo_${index}`;
  const createdAt = new Date(now - piece.daysAgo * DAY_MS - index * 60_000);
  const sourceKind = piece.kind === "notion" ? "notion" : piece.kind === "manual" ? "manual" : "prose";
  const sourceUrl = piece.kind === "article" || piece.kind === "ai" ? (piece.url ?? null) : null;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id, source_url, notion_page_id)
     VALUES ($1, $2, $3, 'detected', $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
    [sourceId, sourceKind, `Demo source ${piece.group ?? index}`, subject, sourceUrl, piece.kind === "notion" ? `demo-page-${index}` : null],
  );

  const body = `${piece.front}\n${piece.back}`;
  const vector = piece.noMeaning ? null : `[${embeddingFor(body, DIM).join(",")}]`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, origin, is_ai_generated, created_at, embedding_vec, embedded_at)
     VALUES ($1, $2, $3, $4, 'approved', $5, $6, $7, $8::halfvec, $9)`,
    [bitId, sourceId, index, body, piece.kind === "manual" ? "manual" : "extracted", piece.kind === "ai", createdAt, vector, vector ? createdAt : null],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', 0, $3, $4)`,
    [`kbqv_demo_${index}`, bitId, piece.front, piece.back],
  );

  const state = schedule(piece.study, now);

  if (state) {
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, phase, suspended_at, buried_until, due_at) VALUES ($1, $2, $3, $4, $5)`,
      [bitId, state.phase, state.suspended, state.buried, new Date(now)],
    );
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  assertLocalDevTarget(connectionString);

  const client = new pg.Client({ connectionString });
  const now = Date.now();

  await client.connect();

  try {
    await client.query("BEGIN");
    await clearDemo(client);

    for (const subject of SUBJECTS.filter((s) => !s.parent).concat(SUBJECTS.filter((s) => s.parent))) {
      await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ($1, $2, $3)`, [subject.id, subject.name, subject.parent]);
    }

    for (const [index, piece] of PIECES.entries()) {
      await insertPiece(client, piece, index, now);
    }

    await client.query("COMMIT");
    console.log(`Seeded ${PIECES.length} demo pieces (${PIECES.filter((p) => p.noMeaning).length} without meaning data).`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
