import { getSettings, saveSettings } from "./settings/settings.js";
import { fetchSubjects } from "./subjects/fetch-subjects.js";
import { renderSubjectOptions } from "./subjects/render-subject-options.js";

const baseUrlInput = document.getElementById("base-url") as HTMLInputElement;
const tokenInput = document.getElementById("token") as HTMLInputElement;
const subjectSelect = document.getElementById("subject") as HTMLSelectElement;
const subjectNote = document.getElementById("subject-note") as HTMLElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLElement;

async function loadSubjects(baseUrl: string, token: string, selectedId: string | undefined): Promise<void> {
  const subjects = await fetchSubjects(baseUrl, token);

  renderSubjectOptions(subjectSelect, subjects ?? [], selectedId);
  subjectNote.textContent = subjects === null ? "Could not load subjects. Check the API address and token." : "";
}

void getSettings().then((settings) => {
  baseUrlInput.value = settings.baseUrl;
  tokenInput.value = settings.token;

  return loadSubjects(settings.baseUrl, settings.token, settings.subjectId);
});

saveButton.addEventListener("click", async () => {
  const result = await saveSettings({
    baseUrl: baseUrlInput.value,
    token: tokenInput.value,
    subjectId: subjectSelect.value,
  });

  status.textContent = result.ok ? "Saved." : "Base URL must be a valid http(s) URL.";
});
