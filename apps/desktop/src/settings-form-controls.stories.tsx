import type { Meta, StoryObj } from "@storybook/react-vite";
import { SaveBar, SettingsField, SettingsSection } from "@/settings-form-controls";

const meta = {
  title: "Desktop/Components/Settings form controls",
  component: SettingsSection,
  args: { id: "daily-goal", title: "Daily goal", children: null },
} satisfies Meta<typeof SettingsSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DailyGoalGroup: Story = {
  render: () => (
    <div className="page">
      <SettingsSection id="daily-goal" title="Daily goal">
        <SettingsField label="Cards per day" htmlFor="daily-goal-input" hint="New cards added each day.">
          <input id="daily-goal-input" type="number" className="field w-28" defaultValue={20} />
        </SettingsField>
        <SaveBar busy={false} state={{ kind: "saved" }} onSave={() => undefined} />
      </SettingsSection>
    </div>
  ),
};

export const SaveError: Story = {
  render: () => (
    <div className="page">
      <SettingsSection id="daily-goal" title="Daily goal">
        <SaveBar busy={false} state={{ kind: "error", message: "Could not save the goal." }} onSave={() => undefined} />
      </SettingsSection>
    </div>
  ),
};
