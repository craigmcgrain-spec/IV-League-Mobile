import ExpoModulesCore
import PDFKit
import UIKit

public final class ReliableSharingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("IVLeagueReliableSharing")

    AsyncFunction("sharePdfAsImageAsync") {
      (url: URL, dialogTitle: String, promise: Promise) in
      do {
        let imageUrl = try self.renderPdfAsJpeg(url)
        let activityController = UIActivityViewController(
          activityItems: [imageUrl, "The IV League II Completed Procedures"],
          applicationActivities: nil
        )
        activityController.title = dialogTitle
        activityController.completionWithItemsHandler = { _, _, _, _ in
          promise.resolve(imageUrl.absoluteString)
        }

        guard let viewController = self.appContext?.utilities?.currentViewController() else {
          throw NSError(
            domain: "IVLeagueReliableSharing",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey: "The share sheet is unavailable."]
          )
        }
        if UIDevice.current.userInterfaceIdiom == .pad {
          activityController.popoverPresentationController?.sourceView = viewController.view
          activityController.popoverPresentationController?.sourceRect = CGRect(
            x: viewController.view.bounds.midX,
            y: viewController.view.bounds.maxY,
            width: 0,
            height: 0
          )
        }
        viewController.present(activityController, animated: true)
      } catch {
        promise.reject(error)
      }
    }
    .runOnQueue(.main)
  }

  private func renderPdfAsJpeg(_ pdfUrl: URL) throws -> URL {
    guard pdfUrl.isFileURL,
          let document = PDFDocument(url: pdfUrl),
          document.pageCount > 0 else {
      throw NSError(
        domain: "IVLeagueReliableSharing",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "The Completed Procedures PDF is unavailable."]
      )
    }

    let bounds = (0..<document.pageCount).compactMap {
      document.page(at: $0)?.bounds(for: .mediaBox)
    }
    guard bounds.count == document.pageCount, let maxWidth = bounds.map(\.width).max() else {
      throw NSError(
        domain: "IVLeagueReliableSharing",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "The PDF pages could not be read."]
      )
    }

    let initialScale = 1080 / maxWidth
    let initialHeight = bounds.reduce(0) { $0 + ($1.height * initialScale) }
    let scale = initialHeight > 12000 ? initialScale * (12000 / initialHeight) : initialScale
    let outputSize = CGSize(
      width: maxWidth * scale,
      height: bounds.reduce(0) { $0 + ($1.height * scale) }
    )
    let renderer = UIGraphicsImageRenderer(size: outputSize)
    let image = renderer.image { rendererContext in
      rendererContext.cgContext.setFillColor(UIColor.white.cgColor)
      rendererContext.cgContext.fill(CGRect(origin: .zero, size: outputSize))
      var top: CGFloat = 0

      for index in 0..<document.pageCount {
        guard let page = document.page(at: index) else {
          continue
        }
        let pageBounds = page.bounds(for: .mediaBox)
        let pageWidth = pageBounds.width * scale
        let pageHeight = pageBounds.height * scale
        let left = (outputSize.width - pageWidth) / 2
        rendererContext.cgContext.saveGState()
        rendererContext.cgContext.translateBy(x: left, y: top + pageHeight)
        rendererContext.cgContext.scaleBy(x: scale, y: -scale)
        rendererContext.cgContext.translateBy(x: -pageBounds.minX, y: -pageBounds.minY)
        page.draw(with: .mediaBox, to: rendererContext.cgContext)
        rendererContext.cgContext.restoreGState()
        top += pageHeight
      }
    }

    guard let jpeg = image.jpegData(compressionQuality: 0.88) else {
      throw NSError(
        domain: "IVLeagueReliableSharing",
        code: 4,
        userInfo: [NSLocalizedDescriptionKey: "The text-message image could not be encoded."]
      )
    }
    let imageUrl = pdfUrl
      .deletingPathExtension()
      .appendingPathExtension("text.jpg")
    try jpeg.write(to: imageUrl, options: .atomic)
    return imageUrl
  }
}
