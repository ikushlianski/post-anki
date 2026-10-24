export const REVIEW_PATH = "/knowledge-bit-review";

type CreateTab = (properties: { url: string }) => unknown;

export function openReviewTab(webUrl: string, createTab: CreateTab): void {
  createTab({ url: `${webUrl}${REVIEW_PATH}` });
}
