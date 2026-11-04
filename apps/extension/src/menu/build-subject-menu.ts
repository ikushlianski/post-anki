import type { SubjectOption } from "../subjects/fetch-subjects.js";

export const SEND_CURRENT_ID = "send-current";
export const PICK_PARENT_ID = "pick-subject";
export const SUBJECT_ID_PREFIX = "subject:";
export const TOKEN_REJECTED_ID = "token-rejected";

export type MenuEntry = { id: string; title: string; parentId?: string };

function byName(a: SubjectOption, b: SubjectOption): number {
  return a.name.localeCompare(b.name);
}

export function subjectIdFromMenuId(menuId: string): string | null {
  return menuId.startsWith(SUBJECT_ID_PREFIX) ? menuId.slice(SUBJECT_ID_PREFIX.length) : null;
}

export function buildTokenRejectedMenu(): MenuEntry[] {
  return [{ id: TOKEN_REJECTED_ID, title: "Token rejected: open extension options" }];
}

export function buildSubjectMenu(subjects: SubjectOption[], currentSubjectId: string | undefined): MenuEntry[] {
  const known = new Set(subjects.map((subject) => subject.id));
  const childrenOf = new Map<string, SubjectOption[]>();
  const roots: SubjectOption[] = [];

  for (const subject of subjects) {
    if (!subject.parentId || !known.has(subject.parentId) || subject.parentId === subject.id) {
      roots.push(subject);

      continue;
    }

    childrenOf.set(subject.parentId, [...(childrenOf.get(subject.parentId) ?? []), subject]);
  }

  const current = subjects.find((subject) => subject.id === currentSubjectId);
  const entries: MenuEntry[] = [
    { id: SEND_CURRENT_ID, title: current ? `Send to post-anki: ${current.name}` : "Send to post-anki (no subject)" },
  ];

  if (subjects.length === 0) {
    return entries;
  }

  entries.push({ id: PICK_PARENT_ID, title: "Send to another subject" });

  const visited = new Set<string>();

  function addSubject(subject: SubjectOption, menuParentId: string): void {
    if (visited.has(subject.id)) {
      return;
    }

    visited.add(subject.id);

    const children = (childrenOf.get(subject.id) ?? []).sort(byName);

    if (children.length === 0) {
      entries.push({ id: `${SUBJECT_ID_PREFIX}${subject.id}`, title: subject.name, parentId: menuParentId });

      return;
    }

    const groupId = `group:${subject.id}`;

    entries.push({ id: groupId, title: subject.name, parentId: menuParentId });
    entries.push({ id: `${SUBJECT_ID_PREFIX}${subject.id}`, title: `${subject.name} (general)`, parentId: groupId });

    for (const child of children) {
      addSubject(child, groupId);
    }
  }

  for (const root of roots.sort(byName)) {
    addSubject(root, PICK_PARENT_ID);
  }

  return entries;
}
