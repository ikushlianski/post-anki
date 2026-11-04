import type { SaveSettingsInput, SaveSettingsResult } from "./settings/settings.js";

type Listener = (event: { preventDefault: () => void }) => void | Promise<void>;

type Listenable = { addEventListener: (type: string, listener: Listener) => void };

export type OptionsFormElements = {
  form: Listenable;
  fields: Listenable[];
  saveButton: { disabled: boolean };
  status: { textContent: string | null };
  read: () => SaveSettingsInput;
};

export type OptionsFormDeps = {
  save: (input: SaveSettingsInput) => Promise<SaveSettingsResult>;
  afterSave: () => Promise<void>;
};

export function describeSaveFailure(result: Extract<SaveSettingsResult, { ok: false }>): string {
  return result.reason === "invalid_web_url"
    ? "Web app address must be a valid http(s) URL."
    : "Base URL must be a valid http(s) URL.";
}

export function bindOptionsForm(elements: OptionsFormElements, deps: OptionsFormDeps): void {
  const { form, fields, saveButton, status, read } = elements;

  for (const field of fields) {
    field.addEventListener("input", () => {
      status.textContent = "";
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (saveButton.disabled) {
      return;
    }

    saveButton.disabled = true;
    status.textContent = "";

    try {
      const result = await deps.save(read());

      if (!result.ok) {
        status.textContent = describeSaveFailure(result);

        return;
      }

      status.textContent = "Saved.";
      await deps.afterSave();
    } finally {
      saveButton.disabled = false;
    }
  });
}
