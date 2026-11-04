import { useState, type ComponentType } from "react";
import { SEGMENT_LABELS, TRIAGE_SEGMENTS, type TriageSegment } from "@/triage-helpers";
import { TriageFocus } from "@/triage-focus";
import { TriageList } from "@/triage-list";
import { TriageInbox } from "@/triage-inbox";
import { TriageChat } from "@/triage-chat";
import { TriageRejected, TriageSuspended } from "@/triage-restore-screens";
import { segmentBarClass, segmentClass } from "@/triage-classes";

const SEGMENT_VIEWS: Record<TriageSegment, ComponentType> = {
  focus: TriageFocus,
  list: TriageList,
  inbox: TriageInbox,
  chat: TriageChat,
  rejected: TriageRejected,
  suspended: TriageSuspended,
};

export function TriageView() {
  const [segment, setSegment] = useState<TriageSegment>("focus");
  const Active = SEGMENT_VIEWS[segment];

  return (
    <section className="page text-text">
      <div role="tablist" aria-label="Triage sections" className={segmentBarClass}>
        {TRIAGE_SEGMENTS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={item === segment}
            className={segmentClass}
            onClick={() => setSegment(item)}
          >
            {SEGMENT_LABELS[item]}
          </button>
        ))}
      </div>
      <Active />
    </section>
  );
}
