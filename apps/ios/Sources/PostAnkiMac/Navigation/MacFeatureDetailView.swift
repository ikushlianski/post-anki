import SwiftUI

struct MacFeatureDetailView: View {
    let feature: MacFeature
    @Environment(\.macNavigator) private var navigator

    var body: some View {
        Group {
            if feature.ownsStack {
                feature.detail(navigator)
            } else {
                NavigationStack {
                    feature.detail(navigator)
                }
            }
        }
        .id(feature.id)
    }
}
