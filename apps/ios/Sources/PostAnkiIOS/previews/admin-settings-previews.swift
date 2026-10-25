#if DEBUG
import PostAnkiAPI
import SwiftUI

#Preview("Admin settings") {
    NavigationStack {
        AdminSettingsScreen(model: AdminSettingsModel.preview)
    }
}

extension AdminSettingsModel {
    @MainActor
    static var preview: AdminSettingsModel {
        let sample = AdminSettings.previewSample
        let model = AdminSettingsModel(loader: { sample }, saver: { _ in sample })

        model.settings = sample

        return model
    }
}

extension AdminSettings {
    static var previewSample: AdminSettings {
        let json = """
        {"testToggle":true,"modelTier":"balanced","knowledgeItemModelId":"openrouter/openai/gpt-6-luna","newCardsPerDay":25}
        """

        return try! JSONDecoder().decode(AdminSettings.self, from: Data(json.utf8))
    }
}
#endif
