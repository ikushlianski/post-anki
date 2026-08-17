import { describe, it, expect } from "vitest";
import type { SeriesSignals } from "@post-anki/shared";
import { deriveSeriesVerdict } from "./series-verdict";

function signals(overrides: Partial<SeriesSignals> = {}): SeriesSignals {
  return {
    explicitSeriesPhrase: null,
    detectedPart: null,
    siblingNavLinkCount: 0,
    hasPaginationLinks: false,
    breadcrumbDepth: 0,
    ...overrides,
  };
}

describe("deriveSeriesVerdict", () => {
  describe("when the page itself says it belongs to a series", () => {
    it("calls the AWS agentic-AI guide a series and quotes the sentence that proved it", () => {
      const result = deriveSeriesVerdict(
        signals({
          explicitSeriesPhrase: "This guide is part of a series about agentic AI on AWS",
          siblingNavLinkCount: 8,
        }),
      );

      expect(result.verdict).toBe("series");
      expect(result.reasons).toEqual([
        'the page states it is part of a series: "This guide is part of a series about agentic AI on AWS"',
        "8 sibling article links were found in the page navigation",
      ]);
    });

    it("calls a numbered installment a series and names the position it declared", () => {
      const result = deriveSeriesVerdict(signals({ detectedPart: { part: 2, total: 5 } }));

      expect(result.verdict).toBe("series");
      expect(result.reasons).toEqual(["the page is labelled part 2 of 5"]);
    });

    it("still calls a part with no announced total a series, because saying part at all is a declaration", () => {
      const result = deriveSeriesVerdict(signals({ detectedPart: { part: 3, total: null } }));

      expect(result.verdict).toBe("series");
      expect(result.reasons).toEqual(["the page is labelled part 3"]);
    });

    it("ignores a part-one-of-one label, which announces a whole rather than a series", () => {
      const result = deriveSeriesVerdict(signals({ detectedPart: { part: 1, total: 1 } }));

      expect(result.verdict).toBe("single");
    });

    it("ignores a blank series phrase rather than treating empty extraction as a declaration", () => {
      const result = deriveSeriesVerdict(signals({ explicitSeriesPhrase: "   " }));

      expect(result.verdict).toBe("single");
    });
  });

  describe("when the page only looks structurally like a series", () => {
    it("refuses to guess series from sibling navigation alone and parks the decision for the user", () => {
      const result = deriveSeriesVerdict(signals({ siblingNavLinkCount: 6 }));

      expect(result.verdict).toBe("unknown");
      expect(result.reasons).toEqual([
        "6 sibling article links were found in the page navigation",
        "nothing on the page states it belongs to a series, so this could not be confirmed",
      ]);
    });

    it("refuses to guess series from pagination alone and parks the decision for the user", () => {
      const result = deriveSeriesVerdict(signals({ hasPaginationLinks: true }));

      expect(result.verdict).toBe("unknown");
      expect(result.reasons).toEqual([
        "the page has next/previous pagination links",
        "nothing on the page states it belongs to a series, so this could not be confirmed",
      ]);
    });

    it("parks a deeply nested page that also carries sibling links, since the two together are suggestive", () => {
      const result = deriveSeriesVerdict(signals({ breadcrumbDepth: 4, siblingNavLinkCount: 1 }));

      expect(result.verdict).toBe("unknown");
      expect(result.reasons).toEqual([
        "1 sibling article link was found in the page navigation",
        "the page sits 4 levels deep in its breadcrumb trail",
        "nothing on the page states it belongs to a series, so this could not be confirmed",
      ]);
    });

    it("does not park an ordinary deeply nested documentation page with no sibling links", () => {
      const result = deriveSeriesVerdict(signals({ breadcrumbDepth: 5 }));

      expect(result.verdict).toBe("single");
      expect(result.reasons).toEqual([
        "the page sits 5 levels deep in its breadcrumb trail",
        "nothing on the page states it belongs to a series, and the hints found are too weak to suggest one",
      ]);
    });

    it("never escalates stacked structural hints to series without a stated one", () => {
      const result = deriveSeriesVerdict(
        signals({ siblingNavLinkCount: 9, hasPaginationLinks: true, breadcrumbDepth: 6 }),
      );

      expect(result.verdict).toBe("unknown");
    });
  });

  describe("when nothing suggests a series", () => {
    it("calls a plain article single so it can be folded into the taxonomy", () => {
      const result = deriveSeriesVerdict(signals());

      expect(result.verdict).toBe("single");
      expect(result.reasons).toEqual([
        "no series wording, sibling article links or pagination were found",
      ]);
    });

    it("treats one or two stray sibling links as ordinary related-reading rather than a series", () => {
      const result = deriveSeriesVerdict(signals({ siblingNavLinkCount: 2 }));

      expect(result.verdict).toBe("single");
      expect(result.reasons).toEqual([
        "2 sibling article links were found in the page navigation",
        "nothing on the page states it belongs to a series, and the hints found are too weak to suggest one",
      ]);
    });
  });

  describe("what the user is shown for an override", () => {
    it("always gives at least one reason, whatever the verdict", () => {
      const cases = [
        signals(),
        signals({ siblingNavLinkCount: 5 }),
        signals({ explicitSeriesPhrase: "part of a series" }),
      ];

      for (const input of cases) {
        expect(deriveSeriesVerdict(input).reasons.length).toBeGreaterThan(0);
      }
    });

    it("ignores nonsensical counts instead of reporting them back to the user", () => {
      const result = deriveSeriesVerdict(
        signals({ siblingNavLinkCount: -4, breadcrumbDepth: Number.NaN }),
      );

      expect(result.verdict).toBe("single");
      expect(result.reasons).toEqual([
        "no series wording, sibling article links or pagination were found",
      ]);
    });
  });
});
