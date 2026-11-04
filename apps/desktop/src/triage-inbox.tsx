import { useState } from "react";
import {
  approveInboxItem,
  discardFromInbox,
  editKnowledgeBit,
  listInboxItems,
  returnFromInbox,
  type ListRow,
} from "@/api/triage-commands";
import { errorMessage } from "@/shared/error-message";
import { useTriageRows } from "@/use-triage-rows";
import { actionsClass, alertClass, listClass } from "@/triage-classes";
import { TriageEmpty, TriageLoadError, TriageLoading } from "@/triage-status";
import { TriageRowCard } from "@/triage-row";

export function TriageInbox() {
  const { rows, status, error: loadError, reload, removeRows } = useTriageRows(listInboxItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  async function run(row: ListRow, failure: string, action: () => Promise<void>, leaves: boolean) {
    if (busyId) return;

    setBusyId(row.id);
    setRowError(null);

    try {
      await action();

      if (leaves) removeRows([row.id]);
    } catch (reason) {
      setRowError({ id: row.id, message: errorMessage(reason, failure) });
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit(row: ListRow) {
    await run(
      row,
      "Could not save the edit. Try again.",
      async () => {
        await editKnowledgeBit(row.id, draftBody, row.background);
        setEditingId(null);
        await reload();
      },
      false,
    );
  }

  if (status === "loading") return <TriageLoading>Loading the inbox…</TriageLoading>;

  if (status === "error") return <TriageLoadError message={loadError} onRetry={() => void reload()} />;

  if (rows.length === 0) {
    return <TriageEmpty title="The inbox is empty." detail="Cards you skip in Focus wait here until you decide." />;
  }

  return (
    <ul className={listClass}>
      {rows.map((row) => {
        const busy = busyId === row.id;
        const editing = editingId === row.id;
        const failure = rowError?.id === row.id ? rowError.message : null;

        return (
          <TriageRowCard key={row.id} body={row.body} background={row.background} meta={row.subjectName}>
            {editing ? (
              <>
                <textarea
                  aria-label="Card text"
                  value={draftBody}
                  onChange={(event) => setDraftBody(event.target.value)}
                  rows={3}
                  className="field min-h-24 resize-y"
                />
                <div className={actionsClass}>
                  <button type="button" className="btn btn-primary" disabled={busy || !draftBody.trim()} onClick={() => void saveEdit(row)}>
                    Save
                  </button>
                  <button type="button" className="btn" disabled={busy} onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className={actionsClass}>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    setEditingId(row.id);
                    setDraftBody(row.body);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() =>
                    void run(row, "Could not approve. Try again.", () => approveInboxItem(row.id), true)
                  }
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    void run(row, "Could not return to triage. Try again.", () => returnFromInbox(row.id), true)
                  }
                >
                  Back to triage
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() =>
                    void run(row, "Could not discard. Try again.", () => discardFromInbox(row.id), true)
                  }
                >
                  Discard
                </button>
              </div>
            )}
            {failure && <p role="alert" className={alertClass}>{failure}</p>}
          </TriageRowCard>
        );
      })}
    </ul>
  );
}
