import { useEffect, useState } from "react";
import {
  getSubjectStudyOptions,
  updateSubjectStudyOptions,
  type SubjectStudyOptions,
  type SubjectStudyOptionsPatch,
} from "@/api/settings-commands";
import { SaveBar, SettingsField, SettingsSwitch, type SaveState } from "@/settings-form-controls";
import {
  buildSubjectOptionsPatch,
  draftFromOptions,
  type IntentChoice,
  type SubjectOptionsDraft,
} from "@/settings-subject-options-patch";
import { loadErrorClass, selectClass, statusClass } from "@/settings-classes";
import { InputWithReset } from "@/settings-input-with-reset";
import { errorMessage } from "@/shared/error-message";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; options: SubjectStudyOptions };

export function SubjectOptionsForm({ subjectId }: { subjectId: string }) {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let active = true;

    setLoad({ kind: "loading" });
    getSubjectStudyOptions(subjectId)
      .then((options) => {
        if (active) {
          setLoad({ kind: "ready", options });
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setLoad({ kind: "error", message: errorMessage(reason, "Could not load these options.") });
        }
      });

    return () => {
      active = false;
    };
  }, [subjectId]);

  if (load.kind === "loading") {
    return <p className={statusClass}>Loading options…</p>;
  }

  if (load.kind === "error") {
    return (
      <p className={loadErrorClass} role="alert">
        {load.message}
      </p>
    );
  }

  return <SubjectOptionsEditor key={subjectId} subjectId={subjectId} initial={load.options} />;
}

function SubjectOptionsEditor({ subjectId, initial }: { subjectId: string; initial: SubjectStudyOptions }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<SubjectOptionsDraft>(() => draftFromOptions(initial));
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  function edit<K extends keyof SubjectOptionsDraft>(key: K, value: SubjectOptionsDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setState({ kind: "idle" });
  }

  async function persist(patch: SubjectStudyOptionsPatch) {
    setBusy(true);

    try {
      const next = await updateSubjectStudyOptions(subjectId, patch);

      setSaved(next);
      setDraft(draftFromOptions(next));
      setState({ kind: "saved" });
    } catch (reason) {
      setState({ kind: "error", message: errorMessage(reason, "Could not save, try again.") });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const built = buildSubjectOptionsPatch(draft, saved);

    if (!built.ok) {
      setState({ kind: "error", message: built.message });

      return;
    }

    if (Object.keys(built.value).length === 0) {
      setState({ kind: "info", message: "No changes to save." });

      return;
    }

    await persist(built.value);
  }

  return (
    <>
      <SettingsField label="Studying for" htmlFor="settings-intent">
        <select
          id="settings-intent"
          value={draft.intent}
          disabled={busy}
          className={selectClass}
          onChange={(event) => edit("intent", event.target.value as IntentChoice)}
        >
          <option value="inherit">Same as parent</option>
          <option value="exam">Exam</option>
          <option value="long_term">Long-term</option>
        </select>
      </SettingsField>
      {draft.intent === "exam" ? (
        <SettingsField label="Exam date" htmlFor="settings-exam-date" hint="Today or up to two years ahead.">
          <input
            id="settings-exam-date"
            type="date"
            value={draft.examDate}
            disabled={busy}
            className={selectClass}
            onChange={(event) => edit("examDate", event.target.value)}
          />
        </SettingsField>
      ) : null}
      <SettingsField label="Desired retention (%)" htmlFor="settings-retention" hint="90% suits most. Range 70 to 99.">
        <InputWithReset
          id="settings-retention"
          value={draft.retention}
          type="number"
          disabled={busy}
          onChange={(value) => edit("retention", value)}
          onReset={() => void persist({ desiredRetention: null })}
          canReset={saved.own.desiredRetention !== null}
          busy={busy}
        />
      </SettingsField>
      <SettingsField label="New cards per day" htmlFor="settings-new-cards" hint="Most new cards from this subject in a day.">
        <InputWithReset
          id="settings-new-cards"
          value={draft.newCards}
          type="number"
          disabled={busy}
          onChange={(value) => edit("newCards", value)}
          onReset={() => void persist({ newCardsPerDay: null })}
          canReset={saved.own.newCardsPerDay !== null}
          busy={busy}
        />
      </SettingsField>
      <SettingsField label="Learning steps (minutes)" htmlFor="settings-learning-steps" hint="For example 1, 10.">
        <InputWithReset
          id="settings-learning-steps"
          value={draft.learningSteps}
          disabled={busy}
          onChange={(value) => edit("learningSteps", value)}
          onReset={() => void persist({ learningStepsMinutes: null })}
          canReset={saved.own.learningStepsMinutes !== null}
          busy={busy}
        />
      </SettingsField>
      <SettingsField label="Relearning steps (minutes)" htmlFor="settings-relearning-steps" hint="For example 10.">
        <InputWithReset
          id="settings-relearning-steps"
          value={draft.relearningSteps}
          disabled={busy}
          onChange={(value) => edit("relearningSteps", value)}
          onReset={() => void persist({ relearningStepsMinutes: null })}
          canReset={saved.own.relearningStepsMinutes !== null}
          busy={busy}
        />
      </SettingsField>
      <SettingsField label="Card detail" htmlFor="settings-detail" hint="Applies to cards generated from now on.">
        <select
          id="settings-detail"
          value={draft.detailLevel}
          disabled={busy}
          className={selectClass}
          onChange={(event) => edit("detailLevel", event.target.value as SubjectOptionsDraft["detailLevel"])}
        >
          <option value="concise">Concise</option>
          <option value="standard">Standard</option>
          <option value="deep">Deep</option>
        </select>
      </SettingsField>
      <SettingsField label="Show hints in review" htmlFor="settings-hinting">
        <SettingsSwitch
          id="settings-hinting"
          checked={draft.hinting}
          disabled={busy}
          onChange={(checked) => edit("hinting", checked)}
        />
      </SettingsField>
      <SaveBar busy={busy} state={state} onSave={() => void save()} />
    </>
  );
}
