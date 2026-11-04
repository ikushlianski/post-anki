import { useEffect, useState } from "react";
import { getDailyGoal, saveDailyGoal, type DailyGoal } from "@/api/settings-commands";
import { SaveBar, SettingsField, SettingsSection, type SaveState } from "@/settings-form-controls";
import { loadErrorClass, narrowFieldClass, statusClass } from "@/settings-classes";
import { DAILY_GOAL_RANGE, parseWholeInRange } from "@/settings-values";
import { errorMessage } from "@/shared/error-message";

const GOAL_MESSAGE = `Enter a whole number from ${DAILY_GOAL_RANGE.min} to ${DAILY_GOAL_RANGE.max}, or leave it empty.`;

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; goal: DailyGoal };

export function DailyGoalSection() {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let active = true;

    getDailyGoal()
      .then((goal) => {
        if (active) {
          setLoad({ kind: "ready", goal });
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setLoad({ kind: "error", message: errorMessage(reason, "Could not load the daily goal.") });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <SettingsSection id="daily-goal" title="Daily review goal">
      {load.kind === "loading" ? <p className={statusClass}>Loading goal…</p> : null}
      {load.kind === "error" ? (
        <p className={loadErrorClass} role="alert">
          {load.message}
        </p>
      ) : null}
      {load.kind === "ready" ? <DailyGoalEditor initial={load.goal} /> : null}
    </SettingsSection>
  );
}

function DailyGoalEditor({ initial }: { initial: DailyGoal }) {
  const [saved, setSaved] = useState<number | null>(initial.dailyReviewTarget);
  const [draft, setDraft] = useState(saved === null ? "" : String(saved));
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  async function save() {
    const target = draft.trim() === "" ? { ok: true as const, value: null } : parseWholeInRange(draft, DAILY_GOAL_RANGE, GOAL_MESSAGE);

    if (!target.ok) {
      setState({ kind: "error", message: target.message });

      return;
    }

    if (target.value === saved) {
      setState({ kind: "info", message: "No changes to save." });

      return;
    }

    setBusy(true);

    try {
      const next = await saveDailyGoal(target.value);

      setSaved(next.dailyReviewTarget);
      setDraft(next.dailyReviewTarget === null ? "" : String(next.dailyReviewTarget));
      setState({ kind: "saved" });
    } catch (reason) {
      setState({ kind: "error", message: errorMessage(reason, "Could not save, try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingsField label="Reviews per day" htmlFor="daily-goal-input" hint="Leave empty for no goal. The count restarts at local midnight.">
        <input
          id="daily-goal-input"
          type="number"
          min={DAILY_GOAL_RANGE.min}
          max={DAILY_GOAL_RANGE.max}
          value={draft}
          disabled={busy}
          className={narrowFieldClass}
          onChange={(event) => {
            setDraft(event.target.value);
            setState({ kind: "idle" });
          }}
        />
      </SettingsField>
      <SaveBar busy={busy} state={state} onSave={() => void save()} />
    </>
  );
}
