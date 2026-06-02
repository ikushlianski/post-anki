import { Bot } from "grammy";
import { loadEnv } from "../env.js";

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
