import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShell } from "@/app-shell";
import { SAMPLE_BACKEND } from "@/storybook-sample-data";

const meta = {
  title: "Desktop/Pages/App shell",
  component: AppShell,
  args: { onSignedOut: () => undefined },
  parameters: { tauriMocks: SAMPLE_BACKEND },
  render: (args) => (
    <div className="-m-6 h-screen">
      <AppShell {...args} />
    </div>
  ),
} satisfies Meta<typeof AppShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SubjectsSection: Story = {};
