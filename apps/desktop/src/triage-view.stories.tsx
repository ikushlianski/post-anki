import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { TriageView } from "@/triage-view";
import { EMPTY_PAGE, SAMPLE_BACKEND } from "@/storybook-sample-data";

const meta = {
  title: "Desktop/Pages/Triage",
  component: TriageView,
  parameters: { tauriMocks: SAMPLE_BACKEND },
} satisfies Meta<typeof TriageView>;

export default meta;

type Story = StoryObj<typeof meta>;

function openSegment(name: string) {
  return async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await userEvent.click(within(canvasElement).getByRole("tab", { name }));
  };
}

export const Focus: Story = {};

export const FocusNothingWaiting: Story = {
  parameters: { tauriMocks: { ...SAMPLE_BACKEND, get_triage_items: [] } },
};

export const ListWithSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("tab", { name: "List" }));

    const checkboxes = await canvas.findAllByRole("checkbox");

    await userEvent.click(checkboxes[0]);
  },
};

export const Inbox: Story = { play: openSegment("Inbox") };

export const Chat: Story = { play: openSegment("Chat") };

export const RejectedWithCards: Story = { play: openSegment("Rejected") };

export const RejectedEmpty: Story = {
  parameters: { tauriMocks: { ...SAMPLE_BACKEND, list_rejected_items: EMPTY_PAGE } },
  play: openSegment("Rejected"),
};

export const SuspendedWithCards: Story = { play: openSegment("Suspended") };

export const SuspendedEmpty: Story = {
  parameters: { tauriMocks: { ...SAMPLE_BACKEND, list_suspended_items: EMPTY_PAGE } },
  play: openSegment("Suspended"),
};
