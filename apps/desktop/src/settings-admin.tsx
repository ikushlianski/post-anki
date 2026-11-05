import { useEffect, useState } from "react";
import {
  getAdminSettings,
  updateAdminSettings,
  type AdminSettings,
  type AdminSettingsPatch,
  type ModelTier,
} from "@/api/settings-commands";
import { buildAdminPatch, draftFromAdminSettings, type AdminDraft } from "@/settings-admin-patch";
import { SaveBar, SettingsField, SettingsSection, SettingsSwitch, type SaveState } from "@/settings-form-controls";
import { fieldClass, loadErrorClass, narrowFieldClass, selectClass, statusClass } from "@/settings-classes";
import { errorMessage } from "@/shared/error-message";

const TIER_LABELS: Record<ModelTier, string> = { cheap: "Cheap", balanced: "Balanced", premium: "Premium" };
const TIERS: ModelTier[] = ["cheap", "balanced", "premium"];

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; settings: AdminSettings };

export function AdminSettingsSection() {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let active = true;

    getAdminSettings()
      .then((settings) => {
        if (active) {
          setLoad({ kind: "ready", settings });
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setLoad({ kind: "error", message: errorMessage(reason, "Could not load admin settings.") });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <SettingsSection id="admin-settings" title="Admin settings">
      {load.kind === "loading" ? <p className={statusClass}>Loading admin settings…</p> : null}
      {load.kind === "error" ? (
        <p className={loadErrorClass} role="alert">
          {load.message}
        </p>
      ) : null}
      {load.kind === "ready" ? <AdminEditor initial={load.settings} /> : null}
    </SettingsSection>
  );
}

function AdminEditor({ initial }: { initial: AdminSettings }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<AdminDraft>(() => draftFromAdminSettings(initial));
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  function edit<K extends keyof AdminDraft>(key: K, value: AdminDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setState({ kind: "idle" });
  }

  async function save() {
    const built = buildAdminPatch(draft, saved);

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

  async function persist(patch: AdminSettingsPatch) {
    setBusy(true);

    try {
      const next = await updateAdminSettings(patch);

      setSaved(next);
      setDraft(draftFromAdminSettings(next));
      setState({ kind: "saved" });
    } catch (reason) {
      setState({ kind: "error", message: errorMessage(reason, "Could not save, try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {saved.modelTier !== null ? (
        <SettingsField label="Model tier" htmlFor="admin-model-tier" hint="Default cost tier for every AI call.">
          <select
            id="admin-model-tier"
            value={draft.modelTier}
            disabled={busy}
            className={selectClass}
            onChange={(event) => edit("modelTier", event.target.value as ModelTier)}
          >
            {TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {TIER_LABELS[tier]}
              </option>
            ))}
          </select>
        </SettingsField>
      ) : null}
      {saved.newCardsPerDay !== null ? (
        <SettingsField label="New cards per day" htmlFor="admin-new-cards" hint="App default, 1 to 200. Subjects can override it.">
          <input
            id="admin-new-cards"
            type="number"
            value={draft.newCards}
            disabled={busy}
            className={narrowFieldClass}
            onChange={(event) => edit("newCards", event.target.value)}
          />
        </SettingsField>
      ) : null}
      {saved.mixNewWithDue !== null ? (
        <SettingsField
          label="Mix new cards with cards I've already seen"
          htmlFor="admin-mix-new"
          hint="On: new cards are shown in between cards you have already seen. Off: new cards come in a separate block."
        >
          <SettingsSwitch
            id="admin-mix-new"
            checked={draft.mixNewWithDue}
            disabled={busy}
            onChange={(checked) => edit("mixNewWithDue", checked)}
          />
        </SettingsField>
      ) : null}
      {saved.learningStepsMinutes !== null ? (
        <SettingsField label="Learning steps (minutes)" htmlFor="admin-learning-steps" hint="App default, for example 1, 10.">
          <input
            id="admin-learning-steps"
            value={draft.learningSteps}
            disabled={busy}
            className={fieldClass}
            onChange={(event) => edit("learningSteps", event.target.value)}
          />
        </SettingsField>
      ) : null}
      {saved.relearningStepsMinutes !== null ? (
        <SettingsField label="Relearning steps (minutes)" htmlFor="admin-relearning-steps" hint="App default, for example 10.">
          <input
            id="admin-relearning-steps"
            value={draft.relearningSteps}
            disabled={busy}
            className={fieldClass}
            onChange={(event) => edit("relearningSteps", event.target.value)}
          />
        </SettingsField>
      ) : null}
      {saved.desiredRetention !== null ? (
        <SettingsField label="Desired retention (%)" htmlFor="admin-retention" hint="App default, 70 to 99.">
          <input
            id="admin-retention"
            type="number"
            value={draft.retention}
            disabled={busy}
            className={narrowFieldClass}
            onChange={(event) => edit("retention", event.target.value)}
          />
        </SettingsField>
      ) : null}
      <SaveBar busy={busy} state={state} onSave={() => void save()} />
    </>
  );
}
