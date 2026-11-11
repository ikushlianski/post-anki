import SwiftUI
import Testing
@testable import PostAnkiMac

struct MacKnowledgeColumnTests {
    @Test func shouldSortAscendingFirstThenFlipOnRepeatedClicks() {
        let first = MacKnowledgeColumn.due.nextSortOrder(from: [])
        #expect(MacKnowledgeColumn.due.direction(in: first) == .forward)

        let second = MacKnowledgeColumn.due.nextSortOrder(from: first)
        #expect(MacKnowledgeColumn.due.direction(in: second) == .reverse)
    }

    @Test func shouldShowDirectionOnlyOnTheSortedColumn() {
        let order = MacKnowledgeColumn.lapses.nextSortOrder(from: [])
        #expect(MacKnowledgeColumn.question.direction(in: order) == nil)
    }

    @Test func shouldOfferSortingOnTheCreatedColumnInBothDirections() {
        #expect(MacKnowledgeColumn.allCases.contains(.created))

        let first = MacKnowledgeColumn.created.nextSortOrder(from: [])
        #expect(MacKnowledgeColumn.created.direction(in: first) == .forward)

        let second = MacKnowledgeColumn.created.nextSortOrder(from: first)
        #expect(MacKnowledgeColumn.created.direction(in: second) == .reverse)
    }

    @Test func shouldFitAllColumnsInsideThePaneWhenItIsWideEnough() {
        for (scale, available) in [(1.0, 900.0), (1.0, 700.0), (1.5, 1200.0)] {
            let widths = MacKnowledgeHeaderMetrics.columnWidths(scale: scale, available: CGFloat(available))
            let count = CGFloat(MacKnowledgeColumn.allCases.count)
            let used = widths.values.reduce(0, +)
                + MacKnowledgeHeaderMetrics.intercellSpacing * (count - 1)
                + MacKnowledgeHeaderMetrics.leadingInset * 2

            #expect(widths.count == MacKnowledgeColumn.allCases.count)
            #expect(used <= CGFloat(available))
        }
    }

    @Test func shouldKeepFixedColumnsOnTheSharedWidthAndFlexOnlyQuestionAndAnswer() {
        let narrow = MacKnowledgeHeaderMetrics.columnWidths(scale: 1.0, available: 700)
        let wide = MacKnowledgeHeaderMetrics.columnWidths(scale: 1.0, available: 1100)

        for column in MacKnowledgeColumn.allCases where !column.isFlexible {
            #expect(narrow[column] == column.width(scale: 1.0))
            #expect(wide[column] == column.width(scale: 1.0))
        }

        #expect(wide[.question]! > narrow[.question]!)
        #expect(narrow[.question]! >= MacKnowledgeColumn.question.minWidth)
    }

    @Test func shouldInsetHeaderTitlesToCellTextEdge() {
        #expect(MacKnowledgeHeaderMetrics.leadingInset == MacKnowledgeHeaderMetrics.intercellSpacing / 2 + MacKnowledgeHeaderMetrics.cellTextInset)
    }

    @Test func shouldGrowHeaderHeightWithZoom() {
        #expect(MacKnowledgeHeaderMetrics.height(scale: 2.0) > MacKnowledgeHeaderMetrics.height(scale: 1.0) * 1.9)
    }
}
