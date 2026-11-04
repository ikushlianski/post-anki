import { useMemo, useState } from "react";
import type { Subject } from "@/api/desktop-commands";
import { SettingsField, SettingsSection } from "@/settings-form-controls";
import { SubjectOptionsForm } from "@/settings-subject-options-form";
import { selectClass } from "@/settings-classes";
import { SubjectsGate } from "@/subjects-gate";
import { subjectPath } from "@/subject-tree";
import { useSubjects } from "@/use-subjects";

export function SubjectOptionsSection() {
  const state = useSubjects();

  return (
    <SettingsSection id="subject-options" title="Subject study options">
      <SubjectsGate state={state}>
        {(subjects) => <SubjectOptionsPicker subjects={subjects} />}
      </SubjectsGate>
    </SettingsSection>
  );
}

function SubjectOptionsPicker({ subjects }: { subjects: Subject[] }) {
  const [selectedId, setSelectedId] = useState("");
  const choices = useMemo(
    () =>
      subjects
        .map((subject) => ({ id: subject.id, label: subjectPath(subject, subjects) }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [subjects],
  );

  if (choices.length === 0) {
    return <p className="m-0 px-4 py-3 text-body text-muted">Add a subject first, then set its study options here.</p>;
  }

  return (
    <>
      <SettingsField label="Subject" htmlFor="settings-subject">
        <select
          id="settings-subject"
          value={selectedId}
          className={selectClass}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">Choose a subject</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
      </SettingsField>
      {selectedId !== "" ? <SubjectOptionsForm key={selectedId} subjectId={selectedId} /> : null}
    </>
  );
}
