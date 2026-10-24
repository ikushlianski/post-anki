// Offline OpenRouter stand-in for the isolated browser-check stack: answers whole-source extraction for the phone-check seed text and returns {} for any other chat request. No network, no real model call.
import { createMockLlmServer } from "./lib/mock-llm.mjs";

const PORT = Number(process.env.PORT ?? 4999);

const SEED_ITEMS = [
  {
    match: "Redis хранит данные в оперативной памяти",
    item: {
      kind: "basic",
      statement: "Redis хранит данные в оперативной памяти, поэтому чтение занимает доли миллисекунды.",
      question: "Почему чтение из Redis занимает доли миллисекунды?",
      answer: "Redis хранит данные в оперативной памяти.",
      quote: "Redis хранит данные в оперативной памяти",
    },
  },
  {
    match: "TTL задаёт время жизни ключа",
    item: {
      kind: "basic",
      statement: "TTL задаёт время жизни ключа, после которого Redis удаляет его сам.",
      question: "Что задаёт TTL в Redis?",
      answer: "Время жизни ключа, после которого Redis удаляет его сам.",
      quote: "TTL задаёт время жизни ключа",
    },
  },
];

createMockLlmServer({ seedItems: SEED_ITEMS, generic: false }).listen(PORT, "127.0.0.1", () =>
  console.log(`mock openrouter on :${PORT}`),
);
