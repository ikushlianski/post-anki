import { useState } from "react";
import { createSubject } from "@/api/subject-commands";
import type { Subject } from "@/api/desktop-commands";
import { SubjectDetailView } from "@/subject-detail-view";
import { SubjectNameForm } from "@/subject-name-form";
import { SubjectRow } from "@/subject-row";
import { buildSubjectTree, flattenWithDepth, type SubjectNode } from "@/subject-tree";
import { reloadSubjects } from "@/use-subjects";

type SubjectsViewProps = { subjects: Subject[]; onReview: (subject: Subject) => void };

type NewSubjectForm = { parent: Subject | null };

function initialExpanded(roots: SubjectNode[]): Set<string> {
  return new Set(roots.map((node) => node.subject.id));
}

export function SubjectsView({ subjects, onReview }: SubjectsViewProps) {
  const tree = buildSubjectTree(subjects);
  const [expanded, setExpanded] = useState(() => initialExpanded(tree));
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<NewSubjectForm | null>(null);

  const detail = subjects.find((subject) => subject.id === detailId);

  if (detail) {
    return (
      <SubjectDetailView
        subject={detail}
        subjects={subjects}
        onBack={() => setDetailId(null)}
        onReview={onReview}
        onAddChild={(parent) => openForm(parent)}
      />
    );
  }

  function openForm(parent: Subject | null) {
    setDetailId(null);
    setForm({ parent });

    if (parent) setExpanded((current) => new Set(current).add(parent.id));
  }

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }

  async function handleCreate(name: string) {
    await createSubject(name, form?.parent?.id ?? null);
    await reloadSubjects();
    setForm(null);
  }

  const rows = flattenWithDepth(tree, expanded);

  return (
    <div className="page">
      <div className="flex items-center justify-between gap-4">
        <p className="muted-text">
          {subjects.length === 1 ? "1 subject" : `${subjects.length} subjects`}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>
          New subject
        </button>
      </div>

      {form ? (
        <SubjectNameForm
          label={form.parent ? `Sub-subject of ${form.parent.name}` : "New subject name"}
          initialValue=""
          submitLabel="Create"
          onSubmit={handleCreate}
          onCancel={() => setForm(null)}
        />
      ) : null}

      {subjects.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No subjects yet.</p>
          <p className="m-0">Subjects group your cards so you can review one topic at a time.</p>
        </div>
      ) : (
        <ul className="list-group">
          {rows.map(({ subject, depth, hasChildren }) => (
            <SubjectRow
              key={subject.id}
              subject={subject}
              depth={depth}
              hasChildren={hasChildren}
              isOpen={expanded.has(subject.id)}
              onToggle={toggle}
              onReview={onReview}
              onOpen={(item) => setDetailId(item.id)}
              onAddChild={(parent) => openForm(parent)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
