import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { ReviewView } from "@/review-view";
import { REVIEW_CARDS, REVIEW_BATCH, SAMPLE_BACKEND } from "@/storybook-sample-data";

const meta = {
  title: "Desktop/Pages/Review",
  component: ReviewView,
  parameters: { tauriMocks: SAMPLE_BACKEND },
} satisfies Meta<typeof ReviewView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CardFront: Story = {};

export const AnswerRevealed: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: /Show answer/ }));
  },
};

export const OfflineWithPendingSync: Story = {
  parameters: {
    tauriMocks: {
      ...SAMPLE_BACKEND,
      get_due_cards: { ...REVIEW_BATCH, offline: true, pending: 3 },
      sync_pending_grades: { pending: 3 },
    },
  },
};

export const NoCardsDue: Story = {
  parameters: {
    tauriMocks: {
      ...SAMPLE_BACKEND,
      get_due_cards: { cards: [], offline: false, pending: 0, counts: { new: 0, learning: 0, review: 0 } },
    },
  },
};

export const ScopedToNegotiation: Story = {
  args: { initialSubjectId: "negotiation" },
  parameters: {
    tauriMocks: {
      ...SAMPLE_BACKEND,
      get_due_cards: { ...REVIEW_BATCH, cards: REVIEW_CARDS.slice(0, 2), counts: { new: 3, learning: 1, review: 6 } },
    },
  },
};
