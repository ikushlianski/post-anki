import http from "node:http";
import type { Update } from "grammy/types";
import { loadEnv } from "./env.js";
import { handleUpdate } from "./telegram/webhook.handler.js";
import { createUpdateLru } from "./telegram/update-lru.js";
import { sendMessage } from "./telegram/bot.js";
import { log } from "./telegram/log.js";
import { getDailyPush, submitAnswer } from "./api/client.js";
import { getPending, setPending, clearPending } from "./session/pending.repo.js";
import { sendTodaysQuestion, type FlowDeps } from "./conversation/probe-flow.js";

const SECRET_HEADER = "x-telegram-bot-api-secret-token";
const DEFAULT_MODE = "socratic" as const;

const flow: FlowDeps = {
  getDailyPush,
  submitAnswer,
  getPending,
  setPending,
  clearPending,
};

function main() {
  const env = loadEnv();
  const lru = createUpdateLru(256);

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/_healthz") {
      res.writeHead(200);
      res.end("ok");
      return;
    }

    if (req.method === "POST" && req.url === "/push") {
      if (req.headers.authorization !== `Bearer ${env.TELEGRAM_WEBHOOK_SECRET}`) {
        res.writeHead(401);
        res.end();
        return;
      }

      res.writeHead(200);
      res.end();

      void sendTodaysQuestion(env.OWNER_TELEGRAM_CHAT_ID, DEFAULT_MODE, flow)
        .then((text) => sendMessage(env.OWNER_TELEGRAM_CHAT_ID, text))
        .catch((err) => log.error({ err }, "daily_push_failed"));

      return;
    }

    if (req.method !== "POST" || req.url !== "/telegram") {
      res.writeHead(404);
      res.end();
      return;
    }

    if (req.headers[SECRET_HEADER] !== env.TELEGRAM_WEBHOOK_SECRET) {
      res.writeHead(401);
      res.end();
      return;
    }

    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
    });

    req.on("end", () => {
      let update: Update;

      try {
        update = JSON.parse(raw) as Update;
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }

      res.writeHead(200);
      res.end();

      void handleUpdate(update, {
        ownerChatId: env.OWNER_TELEGRAM_CHAT_ID,
        lru,
        flow,
        defaultMode: DEFAULT_MODE,
        sendMessage,
      }).catch((err) => log.error({ err }, "handler_failed"));
    });
  });

  server.listen(env.PORT, () => {
    log.info({ port: env.PORT }, "server_listening");
  });
}

main();
