import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BaseDocSize, ZoneSettings } from "../src/types";
import { analyzeCurveSizeAndOpticalSpacing } from "../src/utils/curveSizeAdvisor";

const settings: ZoneSettings = {
  zoneId: "zone-test",
  tagName: "rect",
  originalId: "fixture",
  zoneName: "Fixture",
  frameCount: 6,
  windowWidth: 1.2,
  revealDirection: { dx: 1, dy: 0, angle: 0 },
  notes: "",
};

describe("physical dimension analysis", () => {
  it("converts a 200-unit fallback shape on a 10-inch square into four inches", () => {
    const documentSize: BaseDocSize = {
      label: "10 inch fixture",
      widthInches: 10,
      heightInches: 10,
      unit: "in",
    };

    const result = analyzeCurveSizeAndOpticalSpacing(null, settings, documentSize, {
      width: 500,
      height: 500,
    });

    assert.equal(result.curveWidthMm, 101.6);
    assert.equal(result.curveHeightMm, 101.6);
    assert.equal(result.curveWidthIn, 4);
    assert.equal(result.curveHeightIn, 4);
    assert.equal(result.areaPercentOfWindow, 16);
    assert.equal(result.recommendedWindowWidthMm, 1.25);
    assert.equal(result.recommendedFrameCount, 6);
    assert.equal(result.currentSlitWidthMm, 0.2);
    assert.equal(result.status, "optimal");
  });
});
