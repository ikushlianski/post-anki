import Testing
import CoreGraphics
@testable import PostAnkiMac

struct ZoomFontTests {
    @Test func shouldKeepTheSystemPointSizeAtActualSize() {
        #expect(ZoomFont.body.pointSize(scale: 1.0) == 13)
        #expect(ZoomFont.caption.pointSize(scale: 1.0) == 10)
    }

    @Test func shouldMakeEveryTextStyleProportionallyLargerWhenZoomedIn() {
        #expect(ZoomFont.body.pointSize(scale: 2.0) == 26)
        #expect(ZoomFont.largeTitle.pointSize(scale: 1.5) == 39)
        #expect(ZoomFont.caption.pointSize(scale: 3.0) == 30)
    }

    @Test func shouldShrinkTextWhenZoomedOut() {
        #expect(ZoomFont.title.pointSize(scale: 0.5) == 11)
    }

    @Test func shouldScaleExplicitSizesTheSameWayAsTextStyles() {
        #expect(ZoomFont.system(size: 20, weight: .bold).pointSize(scale: 1.25) == 25)
    }

    @Test func shouldKeepTextStylesInTheirVisualOrderAtEveryZoomStep() {
        for scale in MacZoom.steps {
            let sizes = [ZoomFont.caption, .subheadline, .body, .title3, .title2, .title, .largeTitle]
                .map { $0.pointSize(scale: scale) }

            #expect(sizes == sizes.sorted())
        }
    }
}
