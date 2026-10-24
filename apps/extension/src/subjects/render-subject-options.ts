import type { SubjectOption } from "./fetch-subjects.js";

export function renderSubjectOptions(
  select: HTMLSelectElement,
  subjects: SubjectOption[],
  selectedId: string | undefined,
): void {
  const none = document.createElement("option");

  none.value = "";
  none.textContent = "No subject";
  select.replaceChildren(none);

  for (const subject of subjects) {
    const option = document.createElement("option");

    option.value = subject.id;
    option.textContent = subject.name;
    select.append(option);
  }

  select.value = subjects.some((subject) => subject.id === selectedId) ? (selectedId ?? "") : "";
}
