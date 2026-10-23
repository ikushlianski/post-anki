// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "PostAnkiAPI",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "PostAnkiAPI", targets: ["PostAnkiAPI"])
    ],
    targets: [
        .target(name: "PostAnkiAPI"),
        .testTarget(
            name: "PostAnkiAPITests",
            dependencies: ["PostAnkiAPI"],
            resources: [.process("Fixtures")]
        )
    ]
)
