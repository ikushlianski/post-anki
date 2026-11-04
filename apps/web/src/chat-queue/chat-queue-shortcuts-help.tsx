import { ShortcutsHelp } from "../shortcuts-help/shortcuts-help";
import { CHAT_QUEUE_SHORTCUTS } from "./chat-queue-shortcuts";

export function ChatQueueShortcutsHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ShortcutsHelp
      open={open}
      onOpenChange={onOpenChange}
      shortcuts={CHAT_QUEUE_SHORTCUTS}
      testId="chat-queue-shortcuts-dialog"
    />
  );
}
