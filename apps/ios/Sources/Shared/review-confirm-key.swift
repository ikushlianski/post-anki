enum ReviewConfirmKey {
    static let space: UInt16 = 49
    static let returnKey: UInt16 = 36
    static let numpadEnter: UInt16 = 76

    static func isConfirmKeyCode(_ keyCode: UInt16) -> Bool {
        keyCode == space || keyCode == returnKey || keyCode == numpadEnter
    }

    static func shouldConfirm(
        keyCode: UInt16,
        hasCommandModifiers: Bool,
        isEditingText: Bool,
        isRepeat: Bool,
        isOverlayShown: Bool
    ) -> Bool {
        isConfirmKeyCode(keyCode) && !hasCommandModifiers && !isEditingText && !isRepeat && !isOverlayShown
    }
}
