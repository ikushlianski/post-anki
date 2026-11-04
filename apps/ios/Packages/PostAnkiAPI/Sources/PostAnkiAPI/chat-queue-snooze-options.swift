public enum ChatQueueSnoozeOptions {
    public static let days = [1, 3, 7, 14]

    public static func label(days: Int) -> String {
        days == 1 ? "1 day" : "\(days) days"
    }
}
