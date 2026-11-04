import { useCallback, useEffect, useState } from "react";
import {
  decideTriageItem,
  getTriageItems,
  sendToChat,
  undoTriageDecision,
  type TriageDecision,
  type TriageItem,
} from "@/api/triage-commands";
import { errorMessage } from "@/shared/error-message";
import {
  focusActionForKey,
  focusKeyLabel,
  proposedSubject,
  type FocusAction,
} from "@/triage-helpers";
import { actionsClass, alertClass } from "@/triage-classes";
import { TriageEmpty, TriageLoadError, TriageLoading } from "@/triage-status";

type LastDecision = { item: TriageItem; decision: TriageDecision };

const DECISIONS: TriageDecision[] = ["accept", "reject", "skip"];

const DECISION_LABELS: Record<TriageDecision, string> = {
  accept: "Accept",
  reject: "Reject",
  skip: "Skip to inbox",
};

const DECISION_CLASSES: Record<TriageDecision, string> = {
  accept: "btn-primary",
  reject: "btn-danger",
  skip: "",
};

export function TriageFocus() {
  const [items, setItems] = useState<TriageItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<LastDecision | null>(null);

  const current = items[0];

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      setItems(await getTriageItems());
      setStatus("ready");
    } catch (reason) {
      setError(errorMessage(reason, "Could not load triage."));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (decision: TriageDecision) => {
      if (!current || busy) return;

      setBusy(true);
      setError(null);

      try {
        await decideTriageItem(current.id, decision);
        setItems((prev) => prev.filter((item) => item.id !== current.id));
        setLast({ item: current, decision });
      } catch (reason) {
        setError(errorMessage(reason, "Could not save the decision. Try again."));
      } finally {
        setBusy(false);
      }
    },
    [current, busy],
  );

  const undo = useCallback(async () => {
    if (!last || busy) return;

    setBusy(true);
    setError(null);

    try {
      await undoTriageDecision(last.item.id, last.decision);
      setItems((prev) => [last.item, ...prev]);
      setLast(null);
    } catch (reason) {
      setError(errorMessage(reason, "Could not undo. Try again."));
    } finally {
      setBusy(false);
    }
  }, [last, busy]);

  const sendCurrentToChat = useCallback(async () => {
    if (!current || busy) return;

    setBusy(true);
    setError(null);

    try {
      await sendToChat(current.id);
      setItems((prev) => prev.filter((item) => item.id !== current.id));
      setLast(null);
    } catch (reason) {
      setError(errorMessage(reason, "Could not send to chat. Try again."));
    } finally {
      setBusy(false);
    }
  }, [current, busy]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const action = focusActionForKey(event.key);

      if (!action) return;

      event.preventDefault();
      runAction(action);
    }

    function runAction(action: FocusAction) {
      if (action === "undo") void undo();
      else if (action === "chat") void sendCurrentToChat();
      else void decide(action);
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [decide, undo, sendCurrentToChat]);

  if (status === "loading") {
    return <TriageLoading>Loading triage…</TriageLoading>;
  }

  if (status === "error") {
    return <TriageLoadError message={error} onRetry={() => void load()} />;
  }

  if (!current) {
    return (
      <TriageEmpty
        title="Nothing is waiting for a decision."
        detail="New knowledge you add shows up here for review."
        action={
          <button type="button" className="btn" onClick={() => void load()}>
            Check again
          </button>
        }
      />
    );
  }

  const subject = proposedSubject(current);

  return (
    <section className="flex flex-col gap-4">
      <p aria-live="polite" className="m-0 text-caption font-medium text-muted">
        {items.length} left
      </p>
      <article className="card min-h-60 justify-center gap-3 px-8 py-8">
        <p className="m-0 text-title font-semibold text-text">{current.body}</p>
        {current.background && <p className="muted-text">{current.background}</p>}
        {subject && (
          <p className="m-0 self-start rounded-full bg-accent-soft px-3 py-1 text-caption font-medium text-accent-text">
            Subject: {subject.name}
            {subject.suggested ? " (suggested)" : ""}
          </p>
        )}
      </article>
      {error && <p role="alert" className={alertClass}>{error}</p>}
      <div className="grid grid-cols-3 gap-2">
        {DECISIONS.map((decision) => (
          <button
            key={decision}
            type="button"
            disabled={busy}
            className={`btn min-h-12 text-heading ${DECISION_CLASSES[decision]}`}
            onClick={() => void decide(decision)}
          >
            {DECISION_LABELS[decision]} <kbd className="kbd">{focusKeyLabel(decision)}</kbd>
          </button>
        ))}
      </div>
      <div className={`${actionsClass} justify-center`}>
        <button type="button" disabled={busy || !last} className="btn btn-quiet" onClick={() => void undo()}>
          Undo <kbd className="kbd">{focusKeyLabel("undo")}</kbd>
        </button>
        <button type="button" disabled={busy} className="btn btn-quiet" onClick={() => void sendCurrentToChat()}>
          Chat <kbd className="kbd">{focusKeyLabel("chat")}</kbd>
        </button>
      </div>
    </section>
  );
}
