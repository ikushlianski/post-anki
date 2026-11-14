export const REQUIRED_ENV = ["SMOKE_API_URL", "SMOKE_BOT_URL", "TELEGRAM_BOT_TOKEN"];

export function missingEnv(env) {
  return REQUIRED_ENV.filter((name) => !env[name]);
}

export function redact(text, token) {
  return token ? String(text).split(token).join("[REDACTED]") : String(text);
}

function trimUrl(url) {
  return url.replace(/\/+$/, "");
}

export async function checkWebhook({ fetchFn, botUrl, token }) {
  const name = "telegram webhook";

  try {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const body = await res.json();
    const info = body?.result ?? {};
    const expected = `${trimUrl(botUrl)}/telegram`;

    if (!res.ok || !body?.ok) return { name, ok: false, detail: `getWebhookInfo status ${res.status}` };
    if (info.url !== expected) return { name, ok: false, detail: `webhook url is "${info.url}", expected "${expected}"` };
    if (info.last_error_message) return { name, ok: false, detail: `last_error_message: ${info.last_error_message}` };

    return { name, ok: true, detail: expected };
  } catch (err) {
    return { name, ok: false, detail: redact(err instanceof Error ? err.message : err, token) };
  }
}

export async function checkPushAuth({ fetchFn, botUrl }) {
  const name = "bot /push auth";
  const url = `${trimUrl(botUrl)}/push`;
  const attempts = [
    ["missing bearer", {}],
    ["wrong bearer", { authorization: "Bearer smoke-test-wrong-secret" }],
  ];

  try {
    for (const [label, headers] of attempts) {
      const res = await fetchFn(url, { method: "POST", headers });

      if (res.status !== 401) return { name, ok: false, detail: `${label} returned ${res.status}, expected 401` };
    }

    return { name, ok: true, detail: "missing and wrong bearer rejected with 401" };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkDailyPushRejectsAnonymous({ fetchFn, apiUrl }) {
  const name = "api GET /daily-push";

  try {
    const res = await fetchFn(`${trimUrl(apiUrl)}/daily-push`, { method: "GET" });

    if (res.status !== 401) return { name, ok: false, detail: `unauthenticated request returned ${res.status}, expected 401` };

    return { name, ok: true, detail: "unauthenticated request rejected with 401" };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
