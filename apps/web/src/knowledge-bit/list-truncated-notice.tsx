import type { ListTruncation } from "./list-truncation";

export function ListTruncatedNotice({ truncation, testId }: { truncation: ListTruncation | null; testId: string }) {
  if (!truncation) {
    return null;
  }

  return (
    <p role="status" data-testid={testId} className="mb-3 text-sm text-neutral-600">
      Showing the first {truncation.shown} of {truncation.total} cards
    </p>
  );
}
