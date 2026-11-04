export type SectionId = "subjects" | "add-knowledge" | "review" | "triage" | "settings";

export type Section = { id: SectionId; title: string; shortcutKey: string };

export const SECTIONS: readonly Section[] = [
  { id: "subjects", title: "Subjects", shortcutKey: "1" },
  { id: "add-knowledge", title: "Add knowledge", shortcutKey: "2" },
  { id: "review", title: "Review", shortcutKey: "3" },
  { id: "triage", title: "Triage", shortcutKey: "4" },
  { id: "settings", title: "Settings", shortcutKey: "5" },
];

export function sectionForKeyDown(event: { key: string; metaKey: boolean }): SectionId | null {
  if (!event.metaKey) {
    return null;
  }

  if (event.key.toLowerCase() === "n") {
    return "add-knowledge";
  }

  if (event.key === ",") {
    return "settings";
  }

  const match = SECTIONS.find((section) => section.shortcutKey === event.key);

  return match ? match.id : null;
}
