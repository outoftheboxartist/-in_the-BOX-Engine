import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { SVGZoneInfo, ZoneSettings } from "../src/types";
import {
  generateClosedBarPolygons,
  generateCricutClosedCurveSvg,
} from "../src/utils/cricutExportEngine";

function settings(overrides: Partial<ZoneSettings> = {}): ZoneSettings {
  return {
    zoneId: "zone-0",
    tagName: "rect",
    originalId: "fixture",
    zoneName: "Fixture",
    frameCount: 2,
    windowWidth: 10,
    revealDirection: { dx: 1, dy: 0, angle: 0 },
    notes: "",
    ...overrides,
  };
}

describe("Cricut export geometry", () => {
  it("creates exact closed slice rectangles inside a 100 by 100 polygon", () => {
    const rectangle = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    const polygons = generateClosedBarPolygons(
      { x: 0, y: 0, width: 100, height: 100 },
      rectangle,
      settings(),
      1,
      0,
      false,
    );

    assert.equal(polygons.length, 5);
    assert.deepEqual(polygons[0], [
      { x: 5, y: 0 },
      { x: 5, y: 100 },
      { x: 15, y: 100 },
      { x: 15, y: 0 },
    ]);
    assert.deepEqual(polygons.at(-1), [
      { x: 85, y: 0 },
      { x: 85, y: 100 },
      { x: 95, y: 100 },
      { x: 95, y: 0 },
    ]);
  });
});

describe("Cricut SVG construction", () => {
  const originalDocument = globalThis.document;

  afterEach(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
      writable: true,
    });
  });

  it("serializes a solid rectangle into stable closed contour paths", () => {
    const attributes: Record<string, string> = {
      x: "10",
      y: "20",
      width: "100",
      height: "50",
    };
    const rectangle = {
      tagName: "rect",
      ownerSVGElement: null,
      getAttribute: (name: string) => attributes[name] ?? null,
    } as unknown as SVGElement;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { querySelector: () => rectangle },
      writable: true,
    });

    const zones: SVGZoneInfo[] = [
      { id: "zone-0", tagName: "rect", originalId: "fixture", defaultName: "Fixture" },
    ];
    const svg = generateCricutClosedCurveSvg(
      "0 0 120 90",
      zones,
      { "zone-0": settings({ isSolid: true }) },
    );
    const expectedPath = "M 10.00 20.00 L 110.00 20.00 L 110.00 70.00 L 10.00 70.00 Z";

    assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 120 90"/);
    assert.equal(svg.split(expectedPath).length - 1, 2);
    assert.match(svg, /id="cricut-outer-contours"/);
    assert.match(svg, /id="cricut-closed-slices"/);
  });
});
