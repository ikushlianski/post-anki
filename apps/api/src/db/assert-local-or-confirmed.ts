const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function assertLocalOrConfirmed(databaseUrl: string | undefined, env: NodeJS.ProcessEnv): string {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  let host: string;

  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid connection URL");
  }

  if (!LOCAL_HOSTS.has(host) && env.ALLOW_REMOTE_DB_MIGRATE !== "1") {
    throw new Error(
      `Refusing to run against a non-local database host ("${host}"). ` +
        "Re-run with ALLOW_REMOTE_DB_MIGRATE=1 set only if you mean to change that database.",
    );
  }

  return host;
}
