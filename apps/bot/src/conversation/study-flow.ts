import { sendMessage } from "../telegram/bot.js";
import { createStudyCurriculum, getOrCreateQuickStudiesSubject } from "../api/client.js";

export const STUDY_USAGE_REPLY =
  "Send /study <technology name> — e.g. /study Temporal.";

export function formatStudyStarted(name: string): string {
  return [
    `🔎 Looking for trusted sources on ${name}…`,
    "",
    "Once candidates are found, open the web app to review and approve them — the course isn't generated until you do. If nothing solid turns up, you'll get a chance to generate anyway, clearly marked as ungrounded.",
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
