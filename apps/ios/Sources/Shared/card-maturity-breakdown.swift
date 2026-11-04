import PostAnkiAPI

struct CardMaturityBreakdown: Equatable {
    let new: Int
    let learning: Int
    let mature: Int

    var total: Int { new + learning + mature }
    var isEmpty: Bool { total == 0 }

    init(new: Int, learning: Int, mature: Int) {
        self.new = new
        self.learning = learning
        self.mature = mature
    }

    init(counts: [KnowledgeBrowserSubjectCount]) {
        self.init(
            new: counts.reduce(0) { $0 + $1.newCount },
            learning: counts.reduce(0) { $0 + $1.learningCount },
            mature: counts.reduce(0) { $0 + $1.matureCount }
        )
    }

    init(entry: SubjectTreeEntry) {
        self.init(new: entry.newCount, learning: entry.learningCount, mature: entry.matureCount)
    }

    func percent(_ value: Int) -> Int {
        guard total > 0 else { return 0 }

        return Int((Double(value) / Double(total) * 100).rounded())
    }

    var fractions: SubjectDepthFractions? {
        isEmpty ? nil : SubjectDepthFractions(mature: Double(mature) / Double(total), learning: Double(learning) / Double(total), new: Double(new) / Double(total))
    }

    var countsSummary: String {
        isEmpty ? "No cards yet" : "\(mature) mature · \(learning) learning · \(new) new"
    }

    var percentSummary: String {
        isEmpty ? "No cards yet" : "\(percent(mature))% mature · \(percent(learning))% learning · \(percent(new))% new"
    }
}
