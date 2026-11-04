import { z } from "zod";
import { CLOZE_BLANK } from "./cloze";

export const ORDERED_LIST_MIN_STEPS = 3;
export const ORDERED_LIST_MAX_STEPS = 8;
export const ORDERED_LIST_STEP_MAX_CHARS = 120;
export const ORDERED_LIST_TITLE_MAX_CHARS = 120;
export const ORDERED_LIST_TEXT_MAX_CHARS = 2000;

export const ORDERED_LIST_KINDS = ["list_step", "list_next", "list_overview"] as const;

export type OrderedListKind = (typeof ORDERED_LIST_KINDS)[number];

export const orderedListErrorSchema = z.enum([
  "empty_title",
  "title_too_long",
  "too_few_steps",
  "too_many_steps",
  "empty_step",
  "step_too_long",
  "duplicate_step",
  "reserved_blank",
]);

export type OrderedListError = z.infer<typeof orderedListErrorSchema>;

export const ORDERED_LIST_ERROR_MESSAGES = {
  empty_title: "Put the list title on the first line.",
  title_too_long: `The title can hold at most ${ORDERED_LIST_TITLE_MAX_CHARS} characters.`,
  too_few_steps: `A list needs at least ${ORDERED_LIST_MIN_STEPS} steps, one per line.`,
  too_many_steps: `A list can hold at most ${ORDERED_LIST_MAX_STEPS} steps.`,
  empty_step: "A step has no text.",
  step_too_long: `A step can hold at most ${ORDERED_LIST_STEP_MAX_CHARS} characters.`,
  duplicate_step: "Each step must be different from the others.",
  reserved_blank: `Text cannot contain ${CLOZE_BLANK}.`,
} as const satisfies Record<OrderedListError, string>;

export const orderedListSchema = z.object({
  title: z.string().trim().min(1).max(ORDERED_LIST_TITLE_MAX_CHARS),
  steps: z
    .array(z.string().trim().min(1).max(ORDERED_LIST_STEP_MAX_CHARS))
    .min(ORDERED_LIST_MIN_STEPS)
    .max(ORDERED_LIST_MAX_STEPS),
});

export type OrderedList = z.infer<typeof orderedListSchema>;

export type OrderedListResult = { ok: true; list: OrderedList } | { ok: false; error: OrderedListError };

const STEP_PREFIX = /^\s*(?:\d+[.)]|[-*•])\s*/u;

function stepKey(step: string): string {
  return step.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

export function validateOrderedList(input: { title: string; steps: readonly string[] }): OrderedListResult {
  const title = input.title.trim();
  const steps = input.steps.map((step) => step.trim());

  if (!title) {
    return { ok: false, error: "empty_title" };
  }

  if (title.length > ORDERED_LIST_TITLE_MAX_CHARS) {
    return { ok: false, error: "title_too_long" };
  }

  if (steps.some((step) => !step)) {
    return { ok: false, error: "empty_step" };
  }

  if (steps.length < ORDERED_LIST_MIN_STEPS) {
    return { ok: false, error: "too_few_steps" };
  }

  if (steps.length > ORDERED_LIST_MAX_STEPS) {
    return { ok: false, error: "too_many_steps" };
  }

  if (steps.some((step) => step.length > ORDERED_LIST_STEP_MAX_CHARS)) {
    return { ok: false, error: "step_too_long" };
  }

  if ([title, ...steps].some((text) => text.includes(CLOZE_BLANK))) {
    return { ok: false, error: "reserved_blank" };
  }

  if (new Set(steps.map(stepKey)).size !== steps.length) {
    return { ok: false, error: "duplicate_step" };
  }

  return { ok: true, list: { title, steps } };
}

export function parseOrderedListText(text: string): OrderedListResult {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const [title = "", ...rest] = lines;

  return validateOrderedList({ title, steps: rest.map((line) => line.replace(STEP_PREFIX, "").trim()) });
}

export function formatOrderedListText(list: OrderedList): string {
  return [list.title, ...list.steps].join("\n");
}

export interface OrderedListCard {
  kind: OrderedListKind;
  order: number;
  prompt: string;
  answer: string;
}

export function formatNumberedSteps(steps: readonly string[]): string {
  return steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
}

export function orderedListStatement(list: OrderedList): string {
  return `${list.title}: ${list.steps.join("; ")}`;
}

export function buildOrderedListCards(list: OrderedList): OrderedListCard[] {
  const steps = list.steps.map((step, index): OrderedListCard => ({
    kind: "list_step",
    order: index + 1,
    prompt: `In ${list.title}, what is step ${index + 1}?`,
    answer: step,
  }));
  const next = list.steps.slice(0, -1).map((step, index): OrderedListCard => ({
    kind: "list_next",
    order: index + 1,
    prompt: `${list.title}: after "${step}" the next step is ${CLOZE_BLANK}`,
    answer: list.steps[index + 1] ?? "",
  }));
  const overview: OrderedListCard = {
    kind: "list_overview",
    order: 0,
    prompt: `How many steps are in ${list.title}? Name them in order.`,
    answer: `${list.steps.length} steps\n${formatNumberedSteps(list.steps)}`,
  };

  return [...steps, ...next, overview];
}

export function isOrderedListKind(kind: string): kind is OrderedListKind {
  return (ORDERED_LIST_KINDS as readonly string[]).includes(kind);
}

export const editOrderedListInput = z.object({
  list: z.string().trim().min(1).max(ORDERED_LIST_TEXT_MAX_CHARS),
});

export type EditOrderedListInput = z.input<typeof editOrderedListInput>;
