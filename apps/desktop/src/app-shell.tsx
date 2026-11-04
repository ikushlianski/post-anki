import { useCallback, useEffect, useState, type ReactNode } from "react";
import { type Subject } from "@/api/desktop-commands";
import { AddKnowledgeView } from "@/add-knowledge-view";
import { DevBand } from "@/dev-band";
import { ReviewView } from "@/review-view";
import { sectionForKeyDown, SECTIONS, type SectionId } from "@/sections";
import { SettingsView } from "@/settings-view";
import { Sidebar } from "@/sidebar";
import { SubjectsGate } from "@/subjects-gate";
import { SubjectsView } from "@/subjects-view";
import { TriageView } from "@/triage-view";
import { useSubjects } from "@/use-subjects";

type AppShellProps = { onSignedOut: () => void };

export function AppShell({ onSignedOut }: AppShellProps) {
  const subjects = useSubjects();
  const [section, setSection] = useState<SectionId>("subjects");
  const [reviewSubjectId, setReviewSubjectId] = useState<string | null>(null);

  const goTo = useCallback((next: SectionId) => {
    setSection(next);
    setReviewSubjectId(null);
  }, []);

  const openReview = useCallback((subject: Subject) => {
    setReviewSubjectId(subject.id);
    setSection("review");
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = sectionForKeyDown(event);

      if (target === null) return;

      event.preventDefault();
      goTo(target);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goTo]);

  function renderSection(): ReactNode {
    switch (section) {
      case "subjects":
        return (
          <SubjectsGate state={subjects}>
            {(list) => <SubjectsView subjects={list} onReview={openReview} />}
          </SubjectsGate>
        );
      case "add-knowledge":
        return (
          <SubjectsGate state={subjects}>
            {(list) => <AddKnowledgeView subjects={list} onReviewNew={() => goTo("triage")} />}
          </SubjectsGate>
        );
      case "review":
        return <ReviewView initialSubjectId={reviewSubjectId} />;
      case "triage":
        return <TriageView />;
      case "settings":
        return <SettingsView onSignedOut={onSignedOut} />;
    }
  }

  const title = SECTIONS.find((item) => item.id === section)?.title ?? "";

  return (
    <div className="flex h-full flex-col">
      <DevBand />
      <div className="grid min-h-0 flex-1 grid-cols-[232px_minmax(0,1fr)] overflow-hidden">
        <Sidebar active={section} onSelect={goTo} />
        <main className="flex min-h-0 min-w-0 flex-col bg-bg">
          <header className="flex min-h-14 shrink-0 items-center border-b border-border px-8">
            <h2 className="page my-0 text-heading font-semibold">{title}</h2>
          </header>
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-8 py-6 select-text [&_*]:select-text [&_button]:select-none">
            {renderSection()}
          </div>
        </main>
      </div>
    </div>
  );
}
