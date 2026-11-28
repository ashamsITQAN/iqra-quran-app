// swift-tools-version:5.5
import PackageDescription

let package = Package(
    name: "Tikrar",
    products: [.library(name: "Tikrar", targets: ["Tikrar"])],
    targets: [
        .target(name: "Tikrar"),
        // Runs the shared vectors:  swift run TikrarVectors ../tests/vectors.txt
        .executableTarget(name: "TikrarVectors", dependencies: ["Tikrar"]),
    ]
)
