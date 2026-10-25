const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function assertDevDbIsLocal(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === "production" || env.ALLOW_REMOTE_DEV_DB === "1") {
    return;
  }

  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    return;
  }

  let host: string;

  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid connection URL");
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to start outside production against a non-local database host ("${host}"). ` +
        "Use the local Postgres container, or set ALLOW_REMOTE_DEV_DB=1 if you mean it.",
    );
  }
}
