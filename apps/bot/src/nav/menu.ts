import type { CurriculumDetail, Module, Subject } from "@post-anki/shared";
import type { InlineKeyboard } from "../telegram/bot.js";
import { editMessageText, sendMessageWithKeyboard } from "../telegram/bot.js";
import {
  getCurricula,
  getCurriculumDetail,
  getSubjects,
} from "../api/client.js";
import { getChatContext } from "../session/chat-context.repo.js";

async function requireNavCurriculum(chatId: number): Promise<string> {
  const context = await getChatContext(chatId);

  if (!context?.navCurriculumId) {
    throw new Error("no_nav_curriculum");
  }

  return context.navCurriculumId;
}
import { buildCallback } from "./callback.js";
import { chunkButtons } from "./keyboard.js";
import { formatProgressLabel } from "./progress-label.js";

interface Screen {
  text: string;
  keyboard: InlineKeyboard;
}

export async function showSubjects(chatId: number): Promise<Screen> {
  const [subjects, context] = await Promise.all([
    getSubjects(),
    getChatContext(chatId),
  ]);

  const rows: InlineKeyboard = [];

  if (context && context.mode !== "idle" && context.label) {
    rows.push([
      { text: `▶️ Continue: ${context.label}`, callback_data: buildCallback("continue") },
    ]);
  }

  const subjectButtons = subjects.map((s: Subject) => ({
    text: s.name,
    callback_data: buildCallback("subject", s.id),
  }));

  rows.push(...chunkButtons(subjectButtons, 1));

  return {
    text: subjects.length > 0 ? "Choose a subject:" : "No subjects yet.",
    keyboard: rows,
  };
}

export async function showCurricula(subjectId: string): Promise<Screen> {
  const curricula = await getCurricula(subjectId);

  const buttons = curricula.map((c) => ({
    text: c.status === "confirmed" ? c.name : `${c.name} (preparing)`,
    callback_data: buildCallback("curriculum", c.id),
  }));

  const rows = chunkButtons(buttons, 1);
  rows.push([{ text: "⬅️ Back", callback_data: buildCallback("home") }]);

  return {
    text: curricula.length > 0 ? "Choose a curriculum:" : "No curricula here.",
    keyboard: rows,
  };
}

export async function showCurriculum(curriculumId: string): Promise<Screen> {
  const detail = await getCurriculumDetail(curriculumId);

  if (detail.curriculum.status !== "confirmed") {
    return {
      text: `${detail.curriculum.name} is still being prepared.`,
      keyboard: [[{ text: "⬅️ Back", callback_data: buildCallback("home") }]],
    };
  }

  const rows: InlineKeyboard = [];

  detail.modules.forEach((m: Module) => {
    rows.push([
      {
        text: `${m.title} · ${formatProgressLabel(m.progress.percent)}`,
        callback_data: buildCallback("module", m.id),
      },
    ]);
    rows.push([
      {
        text: "▶️ Start whole module (quiz)",
        callback_data: buildCallback("start_module", m.id),
      },
    ]);
  });

  rows.push([{ text: "⬅️ Back", callback_data: buildCallback("home") }]);

  const header = `📚 ${detail.curriculum.name} · ${formatProgressLabel(detail.progress.percent)}`;

  return { text: header, keyboard: rows };
}

export async function showModule(
  chatId: number,
  moduleId: string,
): Promise<Screen> {
  const curriculumId = await requireNavCurriculum(chatId);
  const detail = await getCurriculumDetail(curriculumId);
  const mod = detail.modules.find((m) => m.id === moduleId);

  if (!mod) {
    return {
      text: "That module is gone.",
      keyboard: [[{ text: "⬅️ Back", callback_data: buildCallback("home") }]],
    };
  }

  const rows: InlineKeyboard = [
    [
      {
        text: "▶️ Start module (quiz)",
        callback_data: buildCallback("start_module", mod.id),
      },
    ],
  ];

  mod.topics
    .filter((t) => t.included)
    .forEach((t) => {
      rows.push([
        {
          text: `${t.title} · ${formatProgressLabel(t.progress.maturity)}`,
          callback_data: buildCallback("topic", t.id),
        },
      ]);
    });

  rows.push([
    { text: "⬅️ Back", callback_data: buildCallback("curriculum", curriculumId) },
  ]);

  return {
    text: `${mod.title} · ${formatProgressLabel(mod.progress.percent)}`,
    keyboard: rows,
  };
}

export async function showTopic(
  chatId: number,
  topicId: string,
): Promise<Screen> {
  const curriculumId = await requireNavCurriculum(chatId);
  const detail = await getCurriculumDetail(curriculumId);

  let topicTitle = "Topic";
  let moduleId = "";

  for (const m of detail.modules) {
    const found = m.topics.find((t) => t.id === topicId);

    if (found) {
      topicTitle = found.title;
      moduleId = m.id;
      break;
    }
  }

  return {
    text: `${topicTitle}`,
    keyboard: [
      [{ text: "▶️ Start", callback_data: buildCallback("start_topic", topicId) }],
      [{ text: "⬅️ Back", callback_data: buildCallback("module", moduleId) }],
    ],
  };
}

export async function sendScreen(
  chatId: number,
  screen: Screen,
): Promise<number> {
  return sendMessageWithKeyboard(chatId, screen.text, screen.keyboard);
}

export async function editScreen(
  chatId: number,
  messageId: number,
  screen: Screen,
): Promise<void> {
  await editMessageText(chatId, messageId, screen.text, screen.keyboard);
}
