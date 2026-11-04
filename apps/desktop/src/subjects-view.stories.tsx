import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { SubjectsView } from "@/subjects-view";
import { BUSINESS_SUBJECTS, SAMPLE_BACKEND } from "@/storybook-sample-data";

const meta = {
  title: "Desktop/Pages/Subjects",
  component: SubjectsView,
  args: {
    subjects: BUSINESS_SUBJECTS,
    onReview: () => undefined,
  },
  parameters: { tauriMocks: SAMPLE_BACKEND },
} satisfies Meta<typeof SubjectsView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithTree: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Expand Negotiation" }));
  },
};

export const Empty: Story = {
  args: { subjects: [] },
};

export const DetailPage: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Details of Negotiation" }));
  },
};
