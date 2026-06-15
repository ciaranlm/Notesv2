// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NotesV2",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "NotesV2", targets: ["NotesV2"])
    ],
    targets: [
        .executableTarget(
            name: "NotesV2",
            path: "NotesV2",
            exclude: ["Resources/Info.plist"]
        ),
        .testTarget(
            name: "NotesV2Tests",
            dependencies: ["NotesV2"]
        )
    ]
)
