import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewGradeButtons } from "@/review-grade-buttons";
import { REVIEW_CARDS } from "@/storybook-sample-data";

const meta = {
  title: "Desktop/Components/Review grade buttons",
  component: ReviewGradeButtons,
  args: {
    disabled: false,
    intervals: REVIEW_CARDS[0].intervals,
    onGrade: () => undefined,
  },
} satisfies Meta<typeof ReviewGradeButtons>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithIntervals: Story = {};

export const WithoutIntervals: Story = {
  args: { intervals: null },
};

export const Disabled: Story = {
  args: { disabled: true },
};
