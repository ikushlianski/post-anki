import { AboutSection, AppearanceSection } from "@/settings-about";
import { AccountSection } from "@/settings-account";
import { AdminSettingsSection } from "@/settings-admin";
import { DailyGoalSection } from "@/settings-daily-goal";
import { SubjectOptionsSection } from "@/settings-subject-options";

type SettingsViewProps = { onSignedOut: () => void };

const SECTIONS = [
  { id: "account", title: "Account" },
  { id: "daily-goal", title: "Daily goal" },
  { id: "subject-options", title: "Subject options" },
  { id: "admin-settings", title: "Admin" },
  { id: "appearance", title: "Appearance" },
  { id: "about", title: "About" },
] as const;

export function SettingsView({ onSignedOut }: SettingsViewProps) {
  function jumpTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="page gap-8 text-text">
      <nav aria-label="Settings sections" className="-mx-2 flex flex-wrap gap-1">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className="btn btn-quiet px-3"
            onClick={() => jumpTo(section.id)}
          >
            {section.title}
          </button>
        ))}
      </nav>
      <AccountSection onSignedOut={onSignedOut} />
      <DailyGoalSection />
      <SubjectOptionsSection />
      <AdminSettingsSection />
      <AppearanceSection />
      <AboutSection />
    </div>
  );
}
