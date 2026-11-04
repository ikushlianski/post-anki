import type { SubjectOption } from "./fetch-subjects.js";
import { orderSubjectTree } from "./order-subject-tree.js";

export function renderSubjectOptions(
  select: HTMLSelectElement,
  subjects: SubjectOption[],
  selectedId: string | undefined,
): void {
  const none = document.createElement("option");

  none.value = "";
  none.textContent = "No subject";
  select.replaceChildren(none);

  for (const { subject, label } of orderSubjectTree(subjects)) {
    const option = document.createElement("option");

    option.value = subject.id;
    option.textContent = label;
    select.append(option);
  }

  select.value = subjects.some((subject) => subject.id === selectedId) ? (selectedId ?? "") : "";
}
