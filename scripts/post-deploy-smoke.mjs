import {
  checkDailyPushRejectsAnonymous,
  checkPushAuth,
  checkWebhook,
  missingEnv,
  redact,
} from "./lib/post-deploy-smoke-checks.mjs";

const missing = missingEnv(process.env);

if (missing.length > 0) {
  console.error(`post-deploy smoke: missing env vars:\n${missing.map((m) => `  - ${m}`).join("\n")}`);
  process.exit(1);
}

const { SMOKE_API_URL: apiUrl, SMOKE_BOT_URL: botUrl, TELEGRAM_BOT_TOKEN: token } = process.env;
const fetchFn = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) });

const results = [
  await checkWebhook({ fetchFn, botUrl, token }),
  await checkPushAuth({ fetchFn, botUrl }),
  await checkDailyPushRejectsAnonymous({ fetchFn, apiUrl }),
];

for (const r of results) {
  console.log(redact(`${r.ok ? "PASS" : "FAIL"} ${r.name}: ${r.detail}`, token));
}

process.exit(results.every((r) => r.ok) ? 0 : 1);
