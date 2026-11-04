import SwiftUI

struct MacReviewView: View {
    var body: some View {
        MacReviewSubjectsView { scope, aheadDays in
            MacDueReviewView(scope: scope, aheadDays: aheadDays)
        }
    }
}
