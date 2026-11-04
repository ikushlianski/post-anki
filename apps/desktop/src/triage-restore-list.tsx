import { useState } from "react";
import type { ListPage, ListRow } from "@/api/triage-commands";
import { errorMessage } from "@/shared/error-message";
import { useTriageRows } from "@/use-triage-rows";
import { actionsClass, alertClass, listClass } from "@/triage-classes";
import { TriageEmpty, TriageLoadError, TriageLoading } from "@/triage-status";
import { TriageRowCard } from "@/triage-row";

type Props = {
  loadPage: (offset: number) => Promise<ListPage>;
  actionLabel: string;
  emptyText: string;
  emptyDetail?: string;
  onAction: (row: ListRow) => Promise<void>;
  meta: (row: ListRow) => string | null;
};

export function TriageRestoreList({ loadPage, actionLabel, emptyText, emptyDetail, onAction, meta }: Props) {
  const { rows, hasMore, status, error: loadError, reload, loadMore, removeRows } = useTriageRows(loadPage);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  async function act(row: ListRow) {
    if (busyId) return;

    setBusyId(row.id);
    setRowError(null);

    try {
      await onAction(row);
      removeRows([row.id]);
    } catch (reason) {
      setRowError({ id: row.id, message: errorMessage(reason, `Could not ${actionLabel.toLowerCase()}. Try again.`) });
    } finally {
      setBusyId(null);
    }
  }

  if (status === "loading") return <TriageLoading>Loading…</TriageLoading>;

  if (status === "error") return <TriageLoadError message={loadError} onRetry={() => void reload()} />;

  if (rows.length === 0) return <TriageEmpty title={emptyText} detail={emptyDetail} />;

  return (
    <section className="flex flex-col gap-4">
      <ul className={listClass}>
        {rows.map((row) => {
          const failure = rowError?.id === row.id ? rowError.message : null;

          return (
            <TriageRowCard key={row.id} body={row.body} meta={meta(row)}>
              <div className={actionsClass}>
                <button
                  type="button"
                  className="btn"
                  disabled={busyId === row.id}
                  onClick={() => void act(row)}
                >
                  {actionLabel}
                </button>
              </div>
              {failure && <p role="alert" className={alertClass}>{failure}</p>}
            </TriageRowCard>
          );
        })}
      </ul>
      {hasMore && (
        <button type="button" className="btn self-center" disabled={busyId !== null} onClick={() => void loadMore()}>
          Load more
        </button>
      )}
    </section>
  );
}
