import { useState } from "react";
import {
  listChatItems,
  returnFromChat,
  snoozeChat,
  type ListRow,
} from "@/api/triage-commands";
import { errorMessage } from "@/shared/error-message";
import { useTriageRows } from "@/use-triage-rows";
import { actionsClass, alertClass, listClass } from "@/triage-classes";
import { TriageEmpty, TriageLoadError, TriageLoading } from "@/triage-status";
import { TriageRowCard } from "@/triage-row";

const SNOOZE_OPTIONS_DAYS = [1, 3, 7, 14] as const;

export function TriageChat() {
  const { rows, status, error: loadError, reload, removeRows } = useTriageRows(listChatItems);
  const [days, setDays] = useState<number>(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  async function run(row: ListRow, failure: string, action: () => Promise<void>, leaves: boolean) {
    if (busyId) return;

    setBusyId(row.id);
    setRowError(null);

    try {
      await action();

      if (leaves) removeRows([row.id]);
      else await reload();
    } catch (reason) {
      setRowError({ id: row.id, message: errorMessage(reason, failure) });
    } finally {
      setBusyId(null);
    }
  }

  if (status === "loading") return <TriageLoading>Loading the chat queue…</TriageLoading>;

  if (status === "error") return <TriageLoadError message={loadError} onRetry={() => void reload()} />;

  if (rows.length === 0) {
    return <TriageEmpty title="Nothing is waiting in chat." detail="Cards you send to chat from Focus wait here." />;
  }

  return (
    <ul className={listClass}>
      {rows.map((row) => {
        const busy = busyId === row.id;
        const failure = rowError?.id === row.id ? rowError.message : null;

        return (
          <TriageRowCard key={row.id} body={row.body} background={row.background} meta={row.note}>
            <div className={actionsClass}>
              <select
                aria-label="Snooze length in days"
                value={days}
                disabled={busy}
                onChange={(event) => setDays(Number(event.target.value))}
                className="field w-auto"
              >
                {SNOOZE_OPTIONS_DAYS.map((option) => (
                  <option key={option} value={option}>
                    {option} {option === 1 ? "day" : "days"}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  void run(row, "Could not snooze. Try again.", () => snoozeChat(row.id, days), false)
                }
              >
                Snooze
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  void run(row, "Could not return to triage. Try again.", () => returnFromChat(row.id), true)
                }
              >
                Back to triage
              </button>
            </div>
            {failure && <p role="alert" className={alertClass}>{failure}</p>}
          </TriageRowCard>
        );
      })}
    </ul>
  );
}
