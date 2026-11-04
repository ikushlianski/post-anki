import type { Meta, StoryObj } from "@storybook/react-vite";
import { DevBand } from "@/dev-band";

const meta: Meta<typeof DevBand> = { title: "Desktop/Components/Dev band", component: DevBand };

export default meta;

export const Shown: StoryObj<typeof DevBand> = { args: { show: true } };
