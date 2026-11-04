import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { SettingsView } from "@/settings-view";
import { SAMPLE_BACKEND } from "@/storybook-sample-data";

const meta = {
  title: "Desktop/Pages/Settings",
  component: SettingsView,
  args: { onSignedOut: () => undefined },
  parameters: { tauriMocks: SAMPLE_BACKEND },
} satisfies Meta<typeof SettingsView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.selectOptions(await canvas.findByLabelText("Subject"), "negotiation");
    await canvas.findByLabelText("Studying for");
  },
};

export const LoadErrors: Story = {
  parameters: {
    tauriMocks: {
      ...SAMPLE_BACKEND,
      get_account: { __error: "Could not reach the API." },
      get_admin_settings: { __error: "Could not reach the API." },
    },
  },
};
