import { Bot } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import { loadEnv } from "../env.js";

export type InlineKeyboard = InlineKeyboardButton[][];

let bot: Bot | undefined;

export function getBot(): Bot {
  if (!bot) {
    const env = loadEnv();
    bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  }
  return bot;
}

export async function sendMessage(chatId: number, text: string): Promise<void> {
  await getBot().api.sendMessage(chatId, text);
}

export async function sendMessageWithKeyboard(
  chatId: number,
  text: string,
  inlineKeyboard: InlineKeyboard,
): Promise<number> {
  const sent = await getBot().api.sendMessage(chatId, text, {
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
  await getBot().api.editMessageText(chatId, messageId, text, {
    reply_markup: inlineKeyboard
      ? { inline_keyboard: inlineKeyboard }
      : undefined,
  });
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
