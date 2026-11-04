import http from "node:http";
import type { Update } from "grammy/types";
import { loadEnv } from "./env.js";
import { handleUpdate } from "./telegram/webhook.handler.js";
import { createUpdateLru } from "./telegram/update-lru.js";
import { sendMessage, sendMessageWithKeyboard, sendChatAction, setMyCommands } from "./telegram/bot.js";
import { registerBotCommands } from "./telegram/register-commands.js";
import { transcribeVoiceNote } from "./voice/voice-transcription.js";
import { log } from "./telegram/log.js";
import {
  getChatQueue,
  getWeeklyDigest,
  getRejectedCards,
  getInboxSummary,
  searchEverything,
  getLearningStats,
  getMotivationTimeZone,
  getReviewCounts,
  getDailyPush,
  getDueQueue,
  getGapsDueForResurface,
  getStaleChatQueueSummary,
  submitAnswer,
} from "./api/client.js";
import { handleWeeklyDigestCommand } from "./weekly-digest/weekly-digest-command.handler.js";
import { handleFindCommand } from "./find/find-command.handler.js";
import { handleInboxCommand } from "./inbox/inbox-command.handler.js";
import { handleRejectedCommand } from "./rejected/rejected-command.handler.js";
import { handleChatCommand } from "./chat-queue/chat-command.handler.js";
import { digestKeyboard, formatDailyDigest, PAUSE_DIGEST_DAYS } from "./digest/daily-digest.js";
import { formatChatReminder } from "./digest/chat-reminder.js";
import { runDailyPush } from "./digest/daily-push.js";
import { createDbReminderDayStore, createDbReminderPauseStore, DAILY_PUSH_KEY } from "./digest/reminder-state.repo.js";
import { isRemindersPaused } from "./digest/reminder-pause.js";
import { readLimitedBody } from "./telegram/read-limited-body.js";
import { handlePauseCommand, handleResumeCommand } from "./digest/pause-command.handler.js";
import { handleStreakCommand } from "./streak/streak-command.handler.js";
import { cardsDueCount } from "./streak/streak-command.js";
import { runGapResurface } from "./gap-triage/gap-triage-flow.js";
import { getPending, setPending, clearPending } from "./session/pending.repo.js";
import { sendTodaysQuestion, type FlowDeps } from "./conversation/probe-flow.js";
import { getChatContext, clearChatContext } from "./session/chat-context.repo.js";
import { handleCallback } from "./nav/dispatcher.js";
import { createBotShutdown, createInflightTracker } from "./shutdown.js";
import { closeDb } from "./db/client.js";
import { secretsEqual } from "./auth/secret-equal.js";
import { showSubjects, sendScreen } from "./nav/menu.js";
import { answerSocratic, endSocratic } from "./socratic/socratic-flow.js";
import { finalizeForSkip, steerToTopic } from "./socratic/session-pivot-flow.js";
import { runSessionIdleSweep } from "./socratic/session-idle-flow.js";
import { startStudy } from "./conversation/study-flow.js";
import type { ChatContextLike } from "./telegram/webhook.handler.js";

const MAX_WEBHOOK_BODY_BYTES = 1_000_000;
const SECRET_HEADER = "x-telegram-bot-api-secret-token";
const DEFAULT_MODE = "socratic" as const;

const flow: FlowDeps = {
  getDailyPush,
  submitAnswer,
  getPending,
  setPending,
  clearPending,
};

const reminderDayStore = createDbReminderDayStore();
const pushDayStore = createDbReminderDayStore(DAILY_PUSH_KEY);
const pauseStore = createDbReminderPauseStore();

async function remindersPausedNow(): Promise<boolean> {
  try {
    return await isRemindersPaused(pauseStore, new Date(), await getMotivationTimeZone());
  } catch (err) {
    log.error({ err }, "reminder_pause_check_failed");

    return false;
  }
}

async function buildChatReminder(): Promise<string | null> {
  try {
    const summary = await getStaleChatQueueSummary();

    return formatChatReminder({ summary, now: new Date(), webBaseUrl: loadEnv().WEB_BASE_URL });
  } catch (err) {
    log.error({ err }, "chat_reminder_fetch_failed");

    return null;
  }
}

async function buildDigestText(questionText: string, chatReminder: string | null): Promise<string> {
  const [dueQueue, gapsDue, cardsDue] = await Promise.all([
    getDueQueue().catch((err) => {
      log.error({ err }, "due_queue_fetch_failed");
      return { items: [] };
    }),
    getGapsDueForResurface().catch((err) => {
      log.error({ err }, "gaps_due_fetch_failed");
      return { userDeferredDue: [], dismissedCheckinDue: [] };
    }),
    getReviewCounts()
      .then(cardsDueCount)
      .catch((err) => {
        log.error({ err }, "review_counts_fetch_failed");
        return 0;
      }),
  ]);

  const [streakDays, inboxCount] = await Promise.all([
    getLearningStats()
      .then((stats) => stats.streak.current)
      .catch((err) => {
        log.error({ err }, "digest_streak_fetch_failed");
        return 0;
      }),
    getInboxSummary()
      .then((inbox) => inbox.count)
      .catch((err) => {
        log.error({ err }, "digest_inbox_fetch_failed");
        return 0;
      }),
  ]);

  return formatDailyDigest({
    streakDays,
    inboxCount,
    dueQueueCount: dueQueue.items.length,
    gapsDueCount: gapsDue.userDeferredDue.length + gapsDue.dismissedCheckinDue.length,
    questionText,
    chatReminder,
    cardsDueCount: cardsDue,
    webBaseUrl: loadEnv().WEB_BASE_URL,
  });
}

function main() {
  const env = loadEnv();
  const lru = createUpdateLru(256);
  const inflight = createInflightTracker();

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/_healthz") {
      res.writeHead(200);
      res.end("ok");
      return;
    }

    if (req.method === "POST" && req.url === "/push") {
      if (!secretsEqual(req.headers.authorization, `Bearer ${env.TELEGRAM_WEBHOOK_SECRET}`)) {
        res.writeHead(401);
        res.end();
        return;
      }

      res.writeHead(200);
      res.end();

      void inflight.track(
        runDailyPush({
          now: () => new Date(),
          getTimeZone: getMotivationTimeZone,
          isPaused: remindersPausedNow,
          pushStore: pushDayStore,
          reminderStore: reminderDayStore,
          sendQuestion: async () => {
            await clearChatContext(env.OWNER_TELEGRAM_CHAT_ID);

            return sendTodaysQuestion(env.OWNER_TELEGRAM_CHAT_ID, DEFAULT_MODE, flow);
          },
          getReminderText: buildChatReminder,
          sendDigest: async (questionText, reminder) => {
            await sendMessageWithKeyboard(
              env.OWNER_TELEGRAM_CHAT_ID,
              await buildDigestText(questionText, reminder),
              digestKeyboard(env.WEB_BASE_URL),
            );
          },
        })
          .then((outcome) => {
            if (outcome !== "sent") log.info({ outcome }, "daily_push_skipped");
          })
        .catch((err) => log.error({ err }, "daily_push_failed")));

      return;
    }

    // gapResurfaceJob (issue #29) — the daily 60-day-deferral / 6-month
    // dismissed-check-in scheduled job, mirroring /push's own auth exactly
    // (same TELEGRAM_WEBHOOK_SECRET bearer check, same fire-and-forget
    // 200-then-work shape).
    if (req.method === "POST" && req.url === "/gap-resurface") {
      if (!secretsEqual(req.headers.authorization, `Bearer ${env.TELEGRAM_WEBHOOK_SECRET}`)) {
        res.writeHead(401);
        res.end();
        return;
      }

      res.writeHead(200);
      res.end();

      void inflight.track(
        getGapsDueForResurface()
          .then((candidates) => runGapResurface(env.OWNER_TELEGRAM_CHAT_ID, candidates))
          .catch((err) => log.error({ err }, "gap_resurface_failed")),
      );

      return;
    }

    // sessionIdleSweepJob (issue #27) — the 5-minute Cloud Scheduler job
    // checking the one owner chat for a Socratic session idle 30+ minutes.
    // Mirrors /gap-resurface's exact shape (same TELEGRAM_WEBHOOK_SECRET
    // bearer, same fire-and-forget 200-then-work). Lives on the bot, not
    // the API, because sending the summary requires the bot's own
    // sendMessage/TELEGRAM_WEBHOOK_SECRET.
    if (req.method === "POST" && req.url === "/session-idle-sweep") {
      if (!secretsEqual(req.headers.authorization, `Bearer ${env.TELEGRAM_WEBHOOK_SECRET}`)) {
        res.writeHead(401);
        res.end();
        return;
      }

      res.writeHead(200);
      res.end();

      void inflight.track(
        runSessionIdleSweep(env.OWNER_TELEGRAM_CHAT_ID).catch((err) =>
          log.error({ err }, "session_idle_sweep_failed"),
        ),
      );

      return;
    }

    if (req.method !== "POST" || req.url !== "/telegram") {
      res.writeHead(404);
      res.end();
      return;
    }

    if (!secretsEqual(req.headers[SECRET_HEADER], env.TELEGRAM_WEBHOOK_SECRET)) {
      res.writeHead(401);
      res.end();
      return;
    }

    readLimitedBody(req, MAX_WEBHOOK_BODY_BYTES, () => {
      res.writeHead(413, { Connection: "close" });
      res.end();
    }).then((body) => {
      if (body === null) return;

      let update: Update;

      try {
        update = JSON.parse(body.toString("utf8")) as Update;
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }

      res.writeHead(200);
      res.end();

      void inflight.track(handleUpdate(update, {
        ownerChatId: env.OWNER_TELEGRAM_CHAT_ID,
        lru,
        flow,
        defaultMode: DEFAULT_MODE,
        sendMessage,
        getChatContext,
        clearChatContext,
        onStart: async (chatId) => {
          await sendScreen(chatId, await showSubjects(chatId, env.WEB_BASE_URL));
        },
        onCallback: async (u) => {
          if (u.callback_query) {
            await handleCallback(u.callback_query, {
              webBaseUrl: env.WEB_BASE_URL,
              onPauseDigest: (chatId) =>
                handlePauseCommand(chatId, String(PAUSE_DIGEST_DAYS), {
                  store: pauseStore,
                  sendMessage,
                  getTimeZone: getMotivationTimeZone,
                }),
            });
          }
        },
        onSocraticText: async (
          chatId: number,
          context: ChatContextLike,
          text: string,
        ) => {
          await answerSocratic(chatId, context, text);
        },
        onChat: (chatId: number, arg: string | null) =>
          handleChatCommand(
            chatId,
            {
              fetchQueue: getChatQueue,
              sendMessage,
              now: () => new Date(),
              webBaseUrl: env.WEB_BASE_URL,
            },
            arg,
          ),
        onDigest: (chatId: number) =>
          handleWeeklyDigestCommand(chatId, {
            fetchDigest: getWeeklyDigest,
            sendMessage,
            webBaseUrl: env.WEB_BASE_URL,
          }),
        onInbox: (chatId: number) =>
          handleInboxCommand(chatId, {
            fetchInbox: getInboxSummary,
            sendMessage,
            webBaseUrl: env.WEB_BASE_URL,
          }),
        onFind: (chatId: number, arg: string | null) =>
          handleFindCommand(chatId, arg, {
            search: searchEverything,
            sendMessage,
            webBaseUrl: env.WEB_BASE_URL,
          }),
        onPause: (chatId: number, arg: string | null) =>
          handlePauseCommand(chatId, arg, { store: pauseStore, sendMessage, getTimeZone: getMotivationTimeZone }),
        onResume: (chatId: number) => handleResumeCommand(chatId, { store: pauseStore, sendMessage }),
        onStreak: (chatId: number) =>
          handleStreakCommand(chatId, {
            fetchSummary: async () => {
              const [counts, stats] = await Promise.all([getReviewCounts(), getLearningStats()]);

              return { counts, stats };
            },
            sendMessage,
            webBaseUrl: env.WEB_BASE_URL,
          }),
        onRejected: (chatId: number, arg: string | null) =>
          handleRejectedCommand(chatId, arg, {
            fetchRejected: getRejectedCards,
            sendMessage,
            webBaseUrl: env.WEB_BASE_URL,
          }),
        onStudy: async (chatId: number, name: string | null) => {
          await startStudy(chatId, name);
        },
        onDone: async (chatId: number, context: ChatContextLike) => {
          await endSocratic(chatId, context);
        },
        onSkip: async (chatId: number, context: ChatContextLike) => {
          await finalizeForSkip(chatId, context);
        },
        onSteer: async (
          chatId: number,
          context: ChatContextLike,
          text: string,
        ) => {
          return steerToTopic(chatId, context, text);
        },
        sendChatAction,
        onVoice: async (
          _chatId: number,
          fileId: string,
          mimeType: string | undefined,
        ) => {
          return transcribeVoiceNote(fileId, mimeType);
        },
      }).catch((err) => log.error({ err }, "handler_failed")));
    });
  });

  const shutdown = createBotShutdown({
    server,
    inflight,
    closeDb,
    exit: (code) => process.exit(code),
    onSignal: (signal) => log.info({ signal }, "bot_shutting_down"),
    onCloseError: (err) => log.warn({ err }, "bot_shutdown_db_close_failed"),
  });

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  server.listen(env.PORT, () => {
    log.info({ port: env.PORT }, "server_listening");
    void registerBotCommands(setMyCommands);
  });
}

main();
