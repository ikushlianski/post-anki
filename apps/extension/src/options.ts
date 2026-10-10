import { getSettings, saveSettings } from "./settings/settings.js";

const baseUrlInput = document.getElementById("base-url") as HTMLInputElement;
const tokenInput = document.getElementById("token") as HTMLInputElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLElement;

void getSettings().then((settings) => {
  baseUrlInput.value = settings.baseUrl;
  tokenInput.value = settings.token;
});

saveButton.addEventListener("click", async () => {
  const result = await saveSettings({ baseUrl: baseUrlInput.value, token: tokenInput.value });

  status.textContent = result.ok ? "Saved." : "Base URL must be a valid http(s) URL.";
});
