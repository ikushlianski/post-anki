import type { ReactNode } from "react";

export function TriageLoading({ children }: { children: ReactNode }) {
  return <p className="muted-text py-2">{children}</p>;
}

export function TriageLoadError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className="notice notice-error w-full">
        {message}
      </p>
      <button type="button" className="btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function TriageEmpty({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {detail ? <p className="m-0">{detail}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
