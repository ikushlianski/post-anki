import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewCountsStrip } from "@/review-counts-strip";

const meta = {
  title: "Desktop/Components/Review counts strip",
  component: ReviewCountsStrip,
  args: { counts: { new: 5, learning: 2, review: 9 } },
} satisfies Meta<typeof ReviewCountsStrip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Remaining: Story = {};

export const NothingLeft: Story = {
  args: { counts: { new: 0, learning: 0, review: 0 } },
};
