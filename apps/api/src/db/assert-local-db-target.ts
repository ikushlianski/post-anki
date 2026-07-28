// Test-only safety guard for the *.integration.test.ts files, which connect a
// real pg client and mutate real tables. Mirrors the shape of
// verification-repo's `db/assert-target-allowed.ts` for this same project
// (host allowlist, fail closed on anything else) — kept here as a tiny local
// copy rather than a cross-repo import, since a vitest run in this repo has
// no dependency on verification-repo at all. Not imported by any production
// code path.
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function assertLocalDbTarget(connectionString: string | undefined): string {
  if (!connectionString || connectionString.trim() === "") {
    throw new Error(
      "DATABASE_URL is required to run an integration test against a real Postgres instance " +
        "and must point at a local database — no implicit default exists for a mutating test target.",
    );
  }

  let host: string;

  try {
    host = new URL(connectionString).hostname;
  } catch {
    throw new Error(`DATABASE_URL is not a valid connection URL: ${connectionString}`);
  }

  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(
      `refusing to connect: host "${host}" is not in the local allowlist ` +
        `(${[...ALLOWED_HOSTS].join(", ")}) — integration tests mutate a local database only, never a cloud/shared one.`,
    );
  }

  return host;
}
