import { sendMessage } from "../telegram/bot.js";
import { createStudyCurriculum, getOrCreateQuickStudiesSubject } from "../api/client.js";

export const STUDY_USAGE_REPLY =
  "Send /study <technology name> — e.g. /study Temporal.";

export function formatStudyStarted(name: string): string {
  return [
    `🔎 Researching ${name}…`,
    "",
    "Once the map is ready, open the web app to review it and pick the slice you want to start with — this bot only kicks off the research.",
  ].join("\n");
}

export async function startStudy(chatId: number, name: string | null): Promise<void> {
  if (!name) {
    await sendMessage(chatId, STUDY_USAGE_REPLY);
    return;
  }

  const subject = await getOrCreateQuickStudiesSubject();

  await createStudyCurriculum(subject.id, name);
  await sendMessage(chatId, formatStudyStarted(name));
}
