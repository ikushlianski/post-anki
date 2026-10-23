import PostAnkiAPI
import SwiftUI

struct PlanStudySessionSheet: View {
    let courses: [(key: String, value: String)]
    let onPlanned: (StudySession, Bool) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var courseId = ""
    @State private var minutes = 20
    @State private var schedules = false
    @State private var scheduledFor = Date().addingTimeInterval(3600)
    @State private var isSaving = false
    @State private var planned: StudySession?
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                if let planned {
                    Section {
                        Text("Session planned.")
                        Button("Start now") {
                            onPlanned(planned, true)
                            dismiss()
                        }
                    }
                } else {
                    form
                }
            }
            .navigationTitle("Plan a session")
            .inlineNavigationTitle()
            .macSheetMinSize(width: 420, height: 320)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(planned == nil ? "Cancel" : "Done") { dismiss() }
                }
            }
        }
    }

    @ViewBuilder
    private var form: some View {
        Section("Focus") {
            Picker("Focus", selection: $courseId) {
                Text("Anything").tag("")

                ForEach(courses, id: \.key) { course in
                    Text(course.value).tag(course.key)
                }
            }
        }

        Section("Length") {
            Stepper("\(minutes) min", value: $minutes, in: 5...120, step: 5)
        }

        Section {
            Toggle("Schedule for", isOn: $schedules)

            if schedules {
                DatePicker("When", selection: $scheduledFor)
            }
        } footer: {
            Text("A planned time is just a reminder to yourself.")
        }

        Section {
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }

            Button("Plan") { Task { await save() } }
                .disabled(isSaving)
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        let input = CreateStudySessionInput(
            targetType: courseId.isEmpty ? nil : "curriculum",
            targetId: courseId.isEmpty ? nil : courseId,
            plannedDurationMinutes: minutes,
            scheduledFor: schedules ? StudySessionDates.format(scheduledFor) : nil
        )

        do {
            let created = try await APIClient.createStudySession(input)
            planned = created
            onPlanned(created, false)
        } catch {
            errorMessage = "Couldn't plan that session. Try again."
        }

        isSaving = false
    }
}
