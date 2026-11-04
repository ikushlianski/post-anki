import {
  bringBackSuspended,
  listRejectedItems,
  listSuspendedItems,
  restoreRejected,
  type ListRow,
} from "@/api/triage-commands";
import { TriageRestoreList } from "@/triage-restore-list";

export function TriageRejected() {
  return (
    <TriageRestoreList
      loadPage={listRejectedItems}
      actionLabel="Restore"
      emptyText="No rejected cards."
      emptyDetail="Cards you reject show up here, so you can restore them later."
      meta={(row) => row.note}
      onAction={(row) => restoreRejected(row.id)}
    />
  );
}

async function bringBack(row: ListRow): Promise<void> {
  if (row.suspended) await bringBackSuspended(row.id, row.variantId, true);

  if (row.buried) await bringBackSuspended(row.id, row.variantId, false);
}

export function TriageSuspended() {
  return (
    <TriageRestoreList
      loadPage={listSuspendedItems}
      actionLabel="Bring back"
      emptyText="No suspended cards."
      emptyDetail="Suspended and buried cards show up here, so you can bring them back."
      meta={(row) => row.note}
      onAction={bringBack}
    />
  );
}
