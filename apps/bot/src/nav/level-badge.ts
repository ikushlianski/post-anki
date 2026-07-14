import type { Level } from "@post-anki/shared";

const LEVEL_LABEL: Record<Level, string> = {
  basic: "🔰 Basic",
  medium: "🧭 Medium",
  advanced: "🚀 Advanced",
};

export function levelBadgeLabel(level: Level | null): string | null {
  return level ? LEVEL_LABEL[level] : null;
}
