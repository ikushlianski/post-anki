export function isDevChannel(): boolean {
  return import.meta.env.VITE_APP_CHANNEL === "dev";
}

export function DevBand({ show = isDevChannel() }: { show?: boolean }) {
  if (!show) return null;

  return (
    <div
      role="status"
      className="flex h-6 shrink-0 items-center justify-center bg-orange-600 text-xs font-bold tracking-widest text-white"
    >
      DEV BUILD
    </div>
  );
}
