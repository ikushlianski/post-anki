import { bindOptionsForm } from "./options-form.js";
import { getSettings, getWebUrl, saveSettings } from "./settings/settings.js";
import { createSubject } from "./subjects/create-subject.js";
import { describeCreateSubjectFailure } from "./subjects/describe-create-subject-failure.js";
import { fetchSubjects } from "./subjects/fetch-subjects.js";
import { orderSubjectTree } from "./subjects/order-subject-tree.js";
import { loadSubjects } from "./subjects/load-subjects.js";

const form = document.getElementById("options-form") as HTMLFormElement;
const baseUrlInput = document.getElementById("base-url") as HTMLInputElement;
const webUrlInput = document.getElementById("web-url") as HTMLInputElement;
const tokenInput = document.getElementById("token") as HTMLInputElement;
const subjectSelect = document.getElementById("subject") as HTMLSelectElement;
const subjectNote = document.getElementById("subject-note") as HTMLElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLElement;

const subjectsView = { select: subjectSelect, note: subjectNote, tokenInput };

void getWebUrl().then((webUrl) => {
  webUrlInput.value = webUrl;
});

void getSettings().then((settings) => {
  baseUrlInput.value = settings.baseUrl;
  tokenInput.value = settings.token;

  return loadSubjects(subjectsView, settings.baseUrl, settings.token, settings.subjectId);
});

bindOptionsForm(
  {
    form,
    fields: [baseUrlInput, webUrlInput, tokenInput, subjectSelect],
    saveButton,
    status,
    read: () => ({
      baseUrl: baseUrlInput.value,
      webUrl: webUrlInput.value,
      token: tokenInput.value,
      subjectId: subjectSelect.value,
    }),
  },
  {
    save: saveSettings,
    afterSave: async () => {
      const saved = await getSettings();

      await loadSubjects(subjectsView, saved.baseUrl, saved.token, subjectSelect.value);
    },
  },
);

const addSubjectForm = document.getElementById("add-subject-form") as HTMLFormElement;
const newSubjectName = document.getElementById("new-subject-name") as HTMLInputElement;
const newSubjectParent = document.getElementById("new-subject-parent") as HTMLSelectElement;
const newSubjectParentNote = document.getElementById("new-subject-parent-note") as HTMLElement;
const addSubjectButton = document.getElementById("add-subject") as HTMLButtonElement;
const addSubjectStatus = document.getElementById("add-subject-status") as HTMLElement;

async function fillParentOptions(): Promise<void> {
  const settings = await getSettings();
  const fetched = await fetchSubjects(settings.baseUrl, settings.token);

  newSubjectParent.replaceChildren(new Option("Top level", ""));

  if (!fetched.ok) {
    newSubjectParentNote.textContent = "Could not load existing subjects, so only Top level is available.";

    return;
  }

  newSubjectParentNote.textContent = "";

  for (const { subject, label } of orderSubjectTree(fetched.subjects)) {
    newSubjectParent.append(new Option(label, subject.id));
  }
}

void fillParentOptions();

addSubjectForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (addSubjectButton.disabled) {
    return;
  }

  addSubjectButton.disabled = true;
  addSubjectStatus.textContent = "";

  void (async () => {
    try {
      const settings = await getSettings();
      const result = await createSubject(settings.baseUrl, settings.token, {
        name: newSubjectName.value,
        ...(newSubjectParent.value ? { parentId: newSubjectParent.value } : {}),
      });

      addSubjectStatus.textContent = result.ok ? `Added ${result.subject.name}` : describeCreateSubjectFailure(result);

      if (result.ok) {
        newSubjectName.value = "";
        await fillParentOptions();
        await loadSubjects(subjectsView, settings.baseUrl, settings.token, subjectSelect.value);
        await chrome.storage.local.remove("subjectsCache");
        await saveSettings({ ...settings, subjectId: subjectSelect.value });
      }
    } finally {
      addSubjectButton.disabled = false;
    }
  })();
});
