import { useEffect, useState } from "react";
import { approveBulk, getTriageItems, type TriageItem } from "@/api/triage-commands";
import { errorMessage } from "@/shared/error-message";
import { proposedSubject, toggleSelected, withoutIds } from "@/triage-helpers";
import { alertClass } from "@/triage-classes";
import { TriageEmpty, TriageLoadError, TriageLoading } from "@/triage-status";

const BULK_CHUNK = 200;

export function TriageList() {
  const [items, setItems] = useState<TriageItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setStatus("loading");

    try {
      setItems(await getTriageItems());
      setStatus("ready");
      setError(null);
    } catch (reason) {
      setError(errorMessage(reason, "Could not load pending items."));
      setStatus("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function approveSelected() {
    if (busy || selected.length === 0) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    const approved: string[] = [];
    const skipped: string[] = [];

    try {
      for (let start = 0; start < selected.length; start += BULK_CHUNK) {
        const result = await approveBulk(selected.slice(start, start + BULK_CHUNK));

        approved.push(...result.approved);
        skipped.push(...result.skipped);
      }

      const gone = [...approved, ...skipped];

      setItems((prev) => prev.filter((item) => !gone.includes(item.id)));
      setSelected((prev) => withoutIds(prev, gone));
      setNotice(
        skipped.length > 0
          ? `Approved ${approved.length}. ${skipped.length} were already decided and were removed.`
          : `Approved ${approved.length}.`,
      );
    } catch (reason) {
      setError(errorMessage(reason, "Could not approve. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return <TriageLoading>Loading pending items…</TriageLoading>;

  if (status === "error") return <TriageLoadError message={error} onRetry={() => void load()} />;

  const allSelected = items.length > 0 && selected.length === items.length;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="btn"
          disabled={items.length === 0}
          onClick={() => setSelected(allSelected ? [] : items.map((item) => item.id))}
        >
          {allSelected ? "Clear selection" : "Select all"}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || selected.length === 0}
          onClick={() => void approveSelected()}
        >
          Approve {selected.length} selected
        </button>
      </div>
      {notice && <p role="status" className="notice">{notice}</p>}
      {error && <p role="alert" className={alertClass}>{error}</p>}
      {items.length === 0 ? (
        <TriageEmpty title="Nothing is waiting for a decision." detail="New knowledge you add shows up here for review." />
      ) : (
        <ul className="list-group">
          {items.map((item) => {
            const subject = proposedSubject(item);
            const checked = selected.includes(item.id);

            return (
              <li key={item.id}>
                <label className={rowLabelClass}>
                  <span className="relative mt-0.5 inline-flex shrink-0">
                    <input
                      type="checkbox"
                      aria-label="Select"
                      className={checkboxClass}
                      checked={checked}
                      onChange={() => setSelected((prev) => toggleSelected(prev, item.id))}
                    />
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      className="pointer-events-none absolute inset-0 hidden size-5 text-on-accent peer-checked:block"
                    >
                      <path d="M4 8.5l2.5 2.5L12 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-body font-semibold text-text">{item.body}</span>
                    {item.background && <span className="text-body font-normal text-muted">{item.background}</span>}
                    {subject && (
                      <span className="text-caption font-normal text-muted">
                        Subject: {subject.name}
                        {subject.suggested ? " (suggested)" : ""}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const rowLabelClass =
  "flex flex-row items-start gap-3 px-4 py-3 cursor-pointer hover:bg-hover has-checked:bg-accent-soft/60";

const checkboxClass =
  "peer m-0 size-5 min-h-0 cursor-pointer appearance-none rounded-[5px] border border-border-strong bg-control p-0 " +
  "shadow-control checked:border-accent checked:bg-accent focus-visible:outline-offset-1";
