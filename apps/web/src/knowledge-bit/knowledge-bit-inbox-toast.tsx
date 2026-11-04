import { useEffect } from "react";

export const INBOX_TOAST_MS = 5000;

export function KnowledgeBitInboxToast({
  bitId,
  destination = "inbox",
  message,
  onUndo,
  onDismiss,
}: {
  bitId: string;
  destination?: "inbox" | "chat";
  message?: string;
  onUndo?: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, INBOX_TOAST_MS);

    return () => clearTimeout(timer);
  }, [bitId, onDismiss]);

  const isChat = destination === "chat";

  return (
    <div
      role="status"
      data-testid="knowledge-bit-inbox-toast"
      className="fixed inset-x-4 bottom-28 z-[60] mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg"
    >
      <span>
        {message ?? (isChat ? "Moved to Chat" : "Moved to Set aside")}
      </span>
      {message === undefined && onUndo ? (
        <span className="flex gap-4">
          <button
            type="button"
            data-testid="knowledge-bit-inbox-toast-undo"
            onClick={onUndo}
            className="min-h-11 font-medium underline"
          >
            Undo
          </button>
          <a
            href={isChat ? "/knowledge/chat" : "/knowledge/inbox"}
            data-testid="knowledge-bit-inbox-toast-open"
            className="inline-flex min-h-11 items-center font-medium underline"
          >
            {isChat ? "Open Chat" : "Open Set aside"}
          </a>
        </span>
      ) : null}
    </div>
  );
}
