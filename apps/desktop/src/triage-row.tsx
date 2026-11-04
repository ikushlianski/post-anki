import type { ReactNode } from "react";

type Props = {
  body: string;
  background?: string | null;
  meta?: string | null;
  children?: ReactNode;
};

export function TriageRowCard({ body, background, meta, children }: Props) {
  return (
    <li className="card gap-3">
      <div className="flex flex-col gap-1">
        <p className="m-0 text-heading font-semibold text-text">{body}</p>
        {background && <p className="muted-text">{background}</p>}
        {meta && <p className="m-0 text-caption text-muted">{meta}</p>}
      </div>
      {children}
    </li>
  );
}
