import { valueClass, wrapValueClass } from "@/settings-classes";
import { SettingsField, SettingsSection } from "@/settings-form-controls";

const APP_NAME = "Post Anki";
const APP_VERSION = "0.1.0";
const API_ADDRESS = "https://post-anki-api-pl6jw2mdla-ew.a.run.app";

export function AppearanceSection() {
  return (
    <SettingsSection id="appearance" title="Appearance">
      <SettingsField label="Theme">
        <span className={valueClass}>Follows system light or dark</span>
      </SettingsField>
    </SettingsSection>
  );
}

export function AboutSection() {
  return (
    <SettingsSection id="about" title="About">
      <SettingsField label="App">
        <span className={valueClass}>{APP_NAME}</span>
      </SettingsField>
      <SettingsField label="Version">
        <span className={valueClass}>{APP_VERSION}</span>
      </SettingsField>
      <SettingsField label="API">
        <span className={wrapValueClass}>{API_ADDRESS}</span>
      </SettingsField>
    </SettingsSection>
  );
}
