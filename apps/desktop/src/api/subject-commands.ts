import { invoke } from "@tauri-apps/api/core";
import type { Subject } from "@/api/desktop-commands";

export type SubjectBit = {
  id: string;
  question: string;
  answer: string;
  state: string;
  dueAt: string | null;
};

export type SubjectBitPage = { items: SubjectBit[]; hasMore: boolean };

export function createSubject(name: string, parentId: string | null): Promise<Subject> {
  return invoke<Subject>("create_subject", { name, parentId });
}

export function renameSubject(subjectId: string, name: string): Promise<Subject> {
  return invoke<Subject>("rename_subject", { subjectId, name });
}

export function deleteSubject(subjectId: string): Promise<void> {
  return invoke<void>("delete_subject", { subjectId });
}

export function getSubjectBits(subjectId: string): Promise<SubjectBitPage> {
  return invoke<SubjectBitPage>("get_subject_bits", { subjectId });
}
