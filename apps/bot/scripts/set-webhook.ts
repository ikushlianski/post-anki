import { loadEnv } from "../src/env.js";

async function main() {
  const env = loadEnv();
  const url = process.argv[2];
  if (!url) {
    console.error("usage: pnpm set-webhook https://<cloud-run-url>/telegram");
    process.exit(1);
  }

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "edited_message", "callback_query"],
      drop_pending_updates: true,
    }),
  });
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
  if (!res.ok || !(body as { ok?: boolean }).ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
