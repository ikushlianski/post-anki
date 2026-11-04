const TOTAL_TURNS = 8;

interface Props {
  turnsLeft: number;
}

export function ChatQueueTurnsMeter({ turnsLeft }: Props) {
  const left = Math.max(0, Math.min(TOTAL_TURNS, turnsLeft));
  const used = TOTAL_TURNS - left;

  return (
    <div className="flex items-center gap-2">
      <div
        role="img"
        data-testid="chat-queue-turns-left"
        aria-label={`${left} of ${TOTAL_TURNS} turns left`}
        className="flex gap-1"
      >
        {Array.from({ length: TOTAL_TURNS }, (_, index) => (
          <span
            key={index}
            data-testid="chat-queue-turn-pip"
            data-filled={index < used}
            className={`h-2 w-4 rounded-sm ${
              index < used ? "bg-neutral-700" : "bg-neutral-200"
            }`}
          />
        ))}
      </div>
      {left === 1 ? (
        <p data-testid="chat-queue-turns-note" className="text-xs font-medium text-amber-700">
          Last turn
        </p>
      ) : null}
      {left === 0 ? (
        <p data-testid="chat-queue-turns-note" className="text-xs font-medium text-amber-700">
          No turns left
        </p>
      ) : null}
    </div>
  );
}
