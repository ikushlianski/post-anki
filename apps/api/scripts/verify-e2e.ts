// End-to-end verification of the full create -> confirm -> probe loop against a
// RUNNING api with a real DATABASE_URL + OPENROUTER_API_KEY.
//
//   1. start the api:   npm run dev -w @post-anki/api   (needs apps/api/.env)
//   2. run this:        npx tsx apps/api/scripts/verify-e2e.ts
//
// Env it reads: API_BASE_URL (default http://localhost:8030), API_SHARED_SECRET.
// Exits non-zero on the first failed step so it can gate CI later.
import process from "node:process";

const BASE = process.env.API_BASE_URL ?? "http://localhost:8030";
const SECRET = process.env.API_SHARED_SECRET;
const headers: Record<string, string> = { "content-type": "application/json" };

if (SECRET) {
  headers.authorization = `Bearer ${SECRET}`;
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  return { status: res.status, json };
}

function step(label: string, ok: boolean, detail: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`, ok ? "" : JSON.stringify(detail));

  if (!ok) {
    process.exit(1);
  }
}

async function poll(curriculumId: string, want: string, tries = 30) {
  for (let i = 0; i < tries; i += 1) {
    const { json } = await call("GET", `/curricula/${curriculumId}`);
    const status = json?.curriculum?.status;

    if (status === want || status === "failed") {
      return status;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  return "timeout";
}

async function main() {
  const health = await call("GET", "/healthz");
  step("GET /healthz", health.status === 200, health);

  const subject = await call("POST", "/subjects", { name: "E2E Backend" });
  step("POST /subjects", subject.status === 201, subject);

  const created = await call("POST", "/curricula", {
    subjectId: subject.json.id,
    name: "Fundamentals of Back-End for Senior Developers",
    sources: [
      {
        kind: "text",
        value:
          "Cover idempotency, transaction isolation, and when eventual consistency is acceptable.",
      },
    ],
  });
  step("POST /curricula (202 curating)", created.status === 202, created);

  const ready = await poll(created.json.id, "ready");
  step("AI parse -> ready", ready === "ready", { ready });

  const detail = await call("GET", `/curricula/${created.json.id}`);
  const firstTopic = detail.json?.modules?.[0]?.topics?.[0];
  step("curriculum has modules+topics", Boolean(firstTopic), detail.json);

  const confirmed = await call("POST", `/curricula/${created.json.id}/confirm`);
  step("POST confirm -> confirmed", confirmed.json?.status === "confirmed", confirmed);

  const probe = await call("POST", `/topics/${firstTopic.id}/probe`, {
    mode: "socratic",
  });
  step("POST probe returns a question", Boolean(probe.json?.prompt), probe);

  const answer = await call("POST", `/topics/${firstTopic.id}/probe/answer`, {
    gapId: probe.json.gapId,
    mode: "socratic",
    answer:
      "Idempotency means a retried operation has the same effect as one call; you key writes on a client idempotency key checked before committing, so duplicate webhooks don't double-charge.",
  });
  step("POST probe/answer evaluates", Boolean(answer.json?.progress), answer);

  const push = await call("GET", "/daily-push");
  step("GET /daily-push", push.status === 200, push);

  console.log("\nE2E PASSED — full create -> confirm -> probe loop works against real DB + LLM.");
}

main().catch((err) => {
  console.error("E2E ERROR:", err);
  process.exit(1);
});
