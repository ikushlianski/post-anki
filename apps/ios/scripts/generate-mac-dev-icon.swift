import AppKit
import CoreGraphics
import Foundation

let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : FileManager.default.currentDirectoryPath)
let catalog = root.appendingPathComponent("Sources/PostAnkiMac/Assets.xcassets")
let macSource = catalog.appendingPathComponent("AppIcon.appiconset")
let target = catalog.appendingPathComponent("AppIconDev.appiconset")
let artwork = root.appendingPathComponent("Sources/PostAnkiIOS/Assets.xcassets/AppIconDev.appiconset/icon-1024.png")

try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)

let contentsData = try Data(contentsOf: macSource.appendingPathComponent("Contents.json"))
try contentsData.write(to: target.appendingPathComponent("Contents.json"))

struct IconEntry: Decodable { let filename: String? }
struct IconContents: Decodable { let images: [IconEntry] }

let filenames = try JSONDecoder().decode(IconContents.self, from: contentsData).images.compactMap(\.filename)

guard let art = NSImage(contentsOf: artwork),
      let artCG = art.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    throw NSError(domain: "icon", code: 1, userInfo: [NSLocalizedDescriptionKey: "cannot read \(artwork.path)"])
}

let gridScale = 824.0 / 1024.0
let cornerRatio = 0.224

func pixelSize(of name: String) -> Int {
    let base = name.replacingOccurrences(of: "icon_", with: "").replacingOccurrences(of: ".png", with: "")
    let parts = base.split(separator: "@")
    let dim = Int(parts[0].split(separator: "x")[0]) ?? 0
    let scale = parts.count > 1 ? Int(parts[1].replacingOccurrences(of: "x", with: "")) ?? 1 : 1

    return dim * scale
}

func render(_ name: String) throws {
    let px = pixelSize(of: name)
    let size = Double(px)
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    guard let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        throw NSError(domain: "icon", code: 2, userInfo: nil)
    }

    ctx.interpolationQuality = .high

    let side = size * gridScale
    let body = CGRect(x: (size - side) / 2, y: (size - side) / 2, width: side, height: side)
    let radius = side * cornerRatio
    let path = CGPath(roundedRect: body, cornerWidth: radius, cornerHeight: radius, transform: nil)

    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -size * 0.01), blur: size * 0.02,
                  color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.3))
    ctx.addPath(path)
    ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    ctx.fillPath()
    ctx.restoreGState()

    ctx.saveGState()
    ctx.addPath(path)
    ctx.clip()
    ctx.draw(artCG, in: body)
    ctx.restoreGState()

    guard let out = ctx.makeImage() else { throw NSError(domain: "icon", code: 3, userInfo: nil) }

    let rep = NSBitmapImageRep(cgImage: out)
    guard let png = rep.representation(using: .png, properties: [:]) else { throw NSError(domain: "icon", code: 4, userInfo: nil) }

    try png.write(to: target.appendingPathComponent(name))
}

for name in filenames {
    try render(name)
    print("wrote \(name)")
}
