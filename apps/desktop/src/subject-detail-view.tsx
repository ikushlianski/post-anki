import { useState } from "react";
import { deleteSubject, renameSubject } from "@/api/subject-commands";
import type { Subject } from "@/api/desktop-commands";
import { SubjectBitList } from "@/subject-bit-list";
import { SubjectDeleteConfirm } from "@/subject-delete-confirm";
import { SubjectNameForm } from "@/subject-name-form";
import { countDescendants, subjectPath } from "@/subject-tree";
import { reloadSubjects } from "@/use-subjects";

type SubjectDetailViewProps = {
  subject: Subject;
  subjects: Subject[];
  onBack: () => void;
  onReview: (subject: Subject) => void;
  onAddChild: (subject: Subject) => void;
};

type DetailMode = "view" | "rename" | "confirm-delete";

export function SubjectDetailView({ subject, subjects, onBack, onReview, onAddChild }: SubjectDetailViewProps) {
  const [mode, setMode] = useState<DetailMode>("view");

  async function handleRename(name: string) {
    await renameSubject(subject.id, name);
    await reloadSubjects();
    setMode("view");
  }

  async function handleDelete() {
    await deleteSubject(subject.id);
    await reloadSubjects();
    onBack();
  }

  return (
    <section className="page" aria-label={`Details of ${subject.name}`}>
      <div className="flex flex-col items-start gap-2">
        <button type="button" className="btn btn-quiet -ml-3 px-3" onClick={onBack}>
          ← Back
        </button>
        <h3 className="m-0 text-title font-semibold [overflow-wrap:anywhere]">{subjectPath(subject, subjects)}</h3>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary min-w-24" onClick={() => onReview(subject)}>
          Review
        </button>
        <button type="button" className="btn" onClick={() => setMode("rename")}>
          Rename
        </button>
        <button type="button" className="btn" onClick={() => onAddChild(subject)}>
          Add sub-subject
        </button>
        <button type="button" className="btn btn-danger sm:ml-auto" onClick={() => setMode("confirm-delete")}>
          Delete
        </button>
      </div>

      {mode === "rename" ? (
        <SubjectNameForm
          label="Subject name"
          initialValue={subject.name}
          submitLabel="Save"
          onSubmit={handleRename}
          onCancel={() => setMode("view")}
        />
      ) : null}

      {mode === "confirm-delete" ? (
        <SubjectDeleteConfirm
          name={subject.name}
          subSubjectCount={countDescendants(subject.id, subjects)}
          onConfirm={handleDelete}
          onCancel={() => setMode("view")}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <h4 className="section-title">Cards</h4>
        <SubjectBitList subjectId={subject.id} />
      </div>
    </section>
  );
}
