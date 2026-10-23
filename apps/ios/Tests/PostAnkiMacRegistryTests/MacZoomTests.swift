import Testing
@testable import PostAnkiMac

struct MacZoomTests {
    @Test func shouldMoveToTheNextLargerStepWhenZoomingIn() {
        #expect(MacZoom.zoomedIn(from: 1.0) == 1.1)
        #expect(MacZoom.zoomedIn(from: 1.1) == 1.25)
    }

    @Test func shouldMoveToTheNextSmallerStepWhenZoomingOut() {
        #expect(MacZoom.zoomedOut(from: 1.0) == 0.9)
        #expect(MacZoom.zoomedOut(from: 1.25) == 1.1)
    }

    @Test func shouldStopAtTheLargestAndSmallestStep() {
        #expect(MacZoom.zoomedIn(from: 3.0) == 3.0)
        #expect(MacZoom.zoomedOut(from: 0.5) == 0.5)
    }

    @Test func shouldSnapAnUnknownStoredScaleToTheNextStepInTheDirectionOfTravel() {
        #expect(MacZoom.zoomedIn(from: 1.05) == 1.1)
        #expect(MacZoom.zoomedOut(from: 1.05) == 1.0)
    }

    @Test func shouldClampACorruptStoredScaleIntoTheSupportedRange() {
        #expect(MacZoom.clamped(0.0) == 0.5)
        #expect(MacZoom.clamped(9.0) == 3.0)
    }

    @Test func shouldResetToActualSizeAndKeepTheStorageKeyStable() {
        #expect(MacZoom.actualSize == 1.0)
        #expect(MacZoom.steps.contains(MacZoom.actualSize))
        #expect(MacZoom.storageKey == "mac.zoomScale")
        #expect(MacZoom.percent(1.25) == 125)
    }
}
