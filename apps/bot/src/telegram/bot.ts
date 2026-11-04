import { Bot } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import { loadEnv } from "../env.js";
import { sliceWithoutSplittingPairs } from "./safe-slice.js";

export type InlineKeyboard = InlineKeyboardButton[][];

let bot: Bot | undefined;

export function getBot(): Bot {
  if (!bot) {
    const env = loadEnv();
    bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  }
  return bot;
}

export const TELEGRAM_MAX_MESSAGE_CHARS = 4096;

export function capMessageText(text: string): string {
  return text.length > TELEGRAM_MAX_MESSAGE_CHARS
    ? `${sliceWithoutSplittingPairs(text, TELEGRAM_MAX_MESSAGE_CHARS - 1)}…`
    : text;
}

function isNotModifiedError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("message is not modified");
}

export async function sendMessage(chatId: number, text: string): Promise<void> {
  await getBot().api.sendMessage(chatId, capMessageText(text));
}

export async function sendMessageWithKeyboard(
  chatId: number,
  text: string,
  inlineKeyboard: InlineKeyboard,
): Promise<number> {
  const sent = await getBot().api.sendMessage(chatId, capMessageText(text), {
    reply_markup: { inline_keyboard: inlineKeyboard },
  });

  return sent.message_id;
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  inlineKeyboard?: InlineKeyboard,
): Promise<void> {
  try {
    await getBot().api.editMessageText(chatId, messageId, capMessageText(text), {
      reply_markup: inlineKeyboard
        ? { inline_keyboard: inlineKeyboard }
        : undefined,
    });
  } catch (err) {
    if (!isNotModifiedError(err)) {
      throw err;
    }
  }
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await getBot().api.answerCallbackQuery(callbackQueryId, text ? { text } : {});
}

export async function sendChatAction(
  chatId: number,
  action: "typing",
): Promise<void> {
  await getBot().api.sendChatAction(chatId, action);
}

export async function setMyCommands(
  commands: { command: string; description: string }[],
): Promise<void> {
  await getBot().api.setMyCommands(commands);
}
