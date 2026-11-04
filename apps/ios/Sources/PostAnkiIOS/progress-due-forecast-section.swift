import Charts
import PostAnkiAPI
import SwiftUI

struct DueForecastSection: View {
    let model: DueForecastModel

    var body: some View {
        if let forecast = model.forecast {
            Section("Next 7 days") {
                Chart(forecast.days) { day in
                    if let date = day.day() {
                        BarMark(x: .value("Day", date, unit: .day), y: .value("Due", day.count))
                            .accessibilityLabel(day.accessibilityLabel())
                            .accessibilityValue("")
                    }
                }
                .frame(height: 120)
                .accessibilityLabel(forecast.accessibilitySummary)
                .accessibilityIdentifier("progress-due-forecast")
            }
        }
    }
}
