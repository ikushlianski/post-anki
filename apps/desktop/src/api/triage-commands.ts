import { invoke } from "@tauri-apps/api/core";

export type TriageDecision = "accept" | "reject" | "skip";

export type TriageItem = {
  id: string;
  body: string;
  background: string | null;
  subjectName: string | null;
  suggestedSubjectName: string | null;
};

export type ListRow = {
  id: string;
  body: string;
  background: string | null;
  subjectName: string | null;
  note: string | null;
  variantId: string | null;
  suspended: boolean;
  buried: boolean;
};

export type ListPage = { items: ListRow[]; hasMore: boolean };

export type BulkApprovalResult = { approved: string[]; skipped: string[] };

export function getTriageItems(): Promise<TriageItem[]> {
  return invoke<TriageItem[]>("get_triage_items");
}

export function decideTriageItem(id: string, decision: TriageDecision): Promise<void> {
  return invoke<void>("decide_triage_item", { id, decision });
}

export function undoTriageDecision(id: string, decision: TriageDecision): Promise<void> {
  return invoke<void>("undo_triage_decision", { id, decision });
}

export function sendToChat(id: string): Promise<void> {
  return invoke<void>("send_to_chat", { id });
}

export function returnFromChat(id: string): Promise<void> {
  return invoke<void>("return_from_chat", { id });
}

export function snoozeChat(id: string, days: number): Promise<void> {
  return invoke<void>("snooze_chat", { id, days });
}

export function returnFromInbox(id: string): Promise<void> {
  return invoke<void>("return_from_inbox", { id });
}

export function discardFromInbox(id: string): Promise<void> {
  return invoke<void>("discard_from_inbox", { id });
}

export function approveInboxItem(id: string): Promise<void> {
  return invoke<void>("approve_inbox_item", { id });
}

export function editKnowledgeBit(id: string, body: string, background: string | null): Promise<void> {
  return invoke<void>("edit_knowledge_bit", { id, body, background });
}

export function approveBulk(ids: string[]): Promise<BulkApprovalResult> {
  return invoke<BulkApprovalResult>("approve_bulk", { ids });
}

export function restoreRejected(id: string): Promise<void> {
  return invoke<void>("restore_rejected", { id });
}

export function bringBackSuspended(id: string, variantId: string | null, suspended: boolean): Promise<void> {
  return invoke<void>("bring_back_suspended", { id, variantId, suspended });
}

export function listInboxItems(): Promise<ListPage> {
  return invoke<ListPage>("list_inbox_items");
}

export function listChatItems(): Promise<ListPage> {
  return invoke<ListPage>("list_chat_items");
}

export function listRejectedItems(offset: number): Promise<ListPage> {
  return invoke<ListPage>("list_rejected_items", { offset });
}

export function listSuspendedItems(offset: number): Promise<ListPage> {
  return invoke<ListPage>("list_suspended_items", { offset });
}
