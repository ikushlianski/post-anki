import { useEffect, useState } from "react";
import { signOut } from "@/api/desktop-commands";
import { getAccount, updateAccountName, type Account } from "@/api/settings-commands";
import { SaveBar, SettingsField, SettingsSection, type SaveState } from "@/settings-form-controls";
import { fieldClass, loadErrorClass, statusClass, wrapValueClass } from "@/settings-classes";
import { errorMessage } from "@/shared/error-message";

const NAME_MAX_LENGTH = 80;

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; account: Account };

export function AccountSection({ onSignedOut }: { onSignedOut: () => void }) {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let active = true;

    getAccount()
      .then((account) => {
        if (active) {
          setLoad({ kind: "ready", account });
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setLoad({ kind: "error", message: errorMessage(reason, "Could not load your account.") });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <SettingsSection id="account" title="Account">
      {load.kind === "loading" ? <p className={statusClass}>Loading account…</p> : null}
      {load.kind === "error" ? (
        <p className={loadErrorClass} role="alert">
          {load.message}
        </p>
      ) : null}
      {load.kind === "ready" ? <AccountEditor initial={load.account} /> : null}
      <SignOutRow onSignedOut={onSignedOut} />
    </SettingsSection>
  );
}

function AccountEditor({ initial }: { initial: Account }) {
  const [saved, setSaved] = useState(initial.name);
  const [draft, setDraft] = useState(initial.name);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  async function save() {
    const name = draft.trim();

    if (name === "") {
      setState({ kind: "error", message: "Enter a name." });

      return;
    }

    if (name.length > NAME_MAX_LENGTH) {
      setState({ kind: "error", message: `Names are at most ${NAME_MAX_LENGTH} characters.` });

      return;
    }

    if (name === saved) {
      setState({ kind: "info", message: "No changes to save." });

      return;
    }

    setBusy(true);

    try {
      const next = await updateAccountName(name);

      setSaved(next.name);
      setDraft(next.name);
      setState({ kind: "saved" });
    } catch (reason) {
      setState({ kind: "error", message: errorMessage(reason, "Could not save, try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingsField label="Email">
        <span className={wrapValueClass}>{initial.email}</span>
      </SettingsField>
      <SettingsField label="Name" htmlFor="account-name">
        <input
          id="account-name"
          value={draft}
          disabled={busy}
          maxLength={NAME_MAX_LENGTH}
          className={fieldClass}
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

function SignOutRow({ onSignedOut }: { onSignedOut: () => void }) {
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setError(null);

    try {
      await signOut();
      onSignedOut();
    } catch (reason) {
      setError(errorMessage(reason, "Could not sign out. Try again."));
    }
  }

  return (
    <>
      <SettingsField label="Sign out">
        <button type="button" className="btn" onClick={handleSignOut}>
          Sign out
        </button>
      </SettingsField>
      {error ? (
        <p className={loadErrorClass} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
