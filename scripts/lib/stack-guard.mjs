const ISOLATED_PORT = "5550";
const ISOLATED_ORIGINS = new Set([`http://localhost:${ISOLATED_PORT}`, `http://127.0.0.1:${ISOLATED_PORT}`]);
const DEV_ORIGIN = "http://localhost:5540";
const ISOLATED_CONTAINER = "post-anki-e2e-db";
const ISOLATED_DB = "postanki_e2e";
const DEV_CONTAINER = "post-anki-dev-db";
const DEV_DB = "postanki_dev";

function originOf(value) {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (url.username || url.password) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function refuse(reason) {
  return { ok: false, reason };
}

export function resolveCheckTarget({ argv, env }) {
  const useDevApp = argv.includes("--use-dev-app");

  if (useDevApp && argv.includes("--seed")) {
    return refuse("refusing to run: --seed writes test data and is never allowed together with --use-dev-app.");
  }

  const rawBase = env.APP_URL ?? (useDevApp ? DEV_ORIGIN : `http://localhost:${ISOLATED_PORT}`);
  const container = env.CHECK_DB_CONTAINER ?? (useDevApp ? DEV_CONTAINER : ISOLATED_CONTAINER);
  const database = env.CHECK_DB_NAME ?? (useDevApp ? DEV_DB : ISOLATED_DB);
  const origin = originOf(rawBase);

  if (useDevApp) {
    if (origin !== DEV_ORIGIN || container !== DEV_CONTAINER || database !== DEV_DB) {
      return refuse(`refusing to run: --use-dev-app only allows ${DEV_ORIGIN}, ${DEV_CONTAINER} and ${DEV_DB}.`);
    }

    return { ok: true, base: origin, container, database, useDevApp };
  }

  if (origin === null || !ISOLATED_ORIGINS.has(origin) || container !== ISOLATED_CONTAINER || database !== ISOLATED_DB) {
    return refuse(
      `refusing to run: only the isolated stack is allowed (${[...ISOLATED_ORIGINS].join(" or ")}, container ${ISOLATED_CONTAINER}, database ${ISOLATED_DB}). Start it with npm run e2e:stack:up. Pass --use-dev-app only when the user asked to look at their own dev data.`,
    );
  }

  return { ok: true, base: origin, container, database, useDevApp };
}
