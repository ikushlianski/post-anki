import { z } from "zod";

export const knowledgeBitBrowserOriginValues = ["manual", "ai_web", "pasted", "notion", "article"] as const;

export type KnowledgeBitBrowserOriginValue = (typeof knowledgeBitBrowserOriginValues)[number];

function listOf(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];

  return parts.filter((part): part is string => typeof part === "string").map((part) => part.trim());
}

export function pickFromAllowed<T extends string>(raw: unknown, allowed: readonly T[]): T[] | undefined {
  const given = listOf(raw);
  const picked = allowed.filter((value) => given.includes(value));

  return picked.length > 0 ? picked : undefined;
}

export function lenientEnumListSchema<const T extends readonly [string, ...string[]]>(allowed: T) {
  return z.preprocess((raw) => pickFromAllowed(raw, allowed), z.array(z.enum(allowed)).optional());
}
