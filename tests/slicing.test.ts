import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ZoneSettings } from "../src/types";
import {
  clipLineToPolygon,
  generateLinesData,
  getBoundingBoxFromPolygon,
} from "../src/utils/slicing";

const RECTANGLE = { x: 0, y: 0, width: 100, height: 100 };

function settings(frameCount: number, windowWidth: number, angle: number): ZoneSettings {
  return {
    zoneId: "zone-test",
    tagName: "rect",
    originalId: "fixture",
    zoneName: "Fixture",
    frameCount,
    windowWidth,
    revealDirection: {
      angle,
      dx: Math.cos((angle * Math.PI) / 180),
      dy: Math.sin((angle * Math.PI) / 180),
    },
    notes: "",
  };
}

describe("generateLinesData", () => {
  it("generates vertical slicing lines for a zero-degree reveal", () => {
    const result = generateLinesData(RECTANGLE, settings(4, 2, 0), 1, 0);
    const centerLine = result.lines.find((line) => line.x1 === 50);

    assert.equal(result.pitch, 8);
    assert.equal(result.lineThickness, 2);
    assert.ok(centerLine);
    assert.equal(centerLine.x1, centerLine.x2);
    assert.ok(centerLine.y1 < 0);
    assert.ok(centerLine.y2 > 100);
  });

  it("generates horizontal slicing lines for a 90-degree reveal", () => {
    const result = generateLinesData(RECTANGLE, settings(4, 2, 90), 1, 0);
    const centerLine = result.lines.reduce((closest, line) =>
      Math.abs(line.y1 - 50) < Math.abs(closest.y1 - 50) ? line : closest,
    );

    assert.ok(Math.abs(centerLine.y1 - 50) < 1e-10);
    assert.ok(Math.abs(centerLine.y2 - 50) < 1e-10);
    assert.ok(centerLine.x1 > 100);
    assert.ok(centerLine.x2 < 0);
  });

  it("uses frame count times window width as the pitch", () => {
    const pitches = [2, 4, 6, 8].map((frameCount) =>
      generateLinesData(RECTANGLE, settings(frameCount, 2, 0), 1, 0).pitch,
    );

    assert.deepEqual(pitches, [4, 8, 12, 16]);
  });

  it("shifts every line by phase times pitch", () => {
    const base = generateLinesData(RECTANGLE, settings(4, 2, 0), 1, 0);
    const shifted = generateLinesData(RECTANGLE, settings(4, 2, 0), 1, 0.5);

    assert.equal(shifted.lines.length, base.lines.length);
    assert.equal(shifted.lines[0].x1 - base.lines[0].x1, 4);
  });

  it("scales pitch, thickness, and phase displacement", () => {
    const base = generateLinesData(RECTANGLE, settings(4, 2, 0), 1, 0.5);
    const doubled = generateLinesData(RECTANGLE, settings(4, 2, 0), 2, 0.5);

    assert.equal(base.pitch, 8);
    assert.equal(doubled.pitch, 16);
    assert.equal(base.lineThickness, 2);
    assert.equal(doubled.lineThickness, 4);
    assert.equal(base.lines[0].x1 - base.cx, (0.5 - (base.lines.length - 1) / 2) * 8);
  });
});

describe("polygon geometry", () => {
  it("clips a horizontal line to a 100 by 100 rectangle", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    assert.deepEqual(clipLineToPolygon({ x1: -10, y1: 50, x2: 110, y2: 50 }, polygon), [
      { x1: 0, y1: 50, x2: 100, y2: 50 },
    ]);
  });

  it("preserves exact bounds for a simple offset rectangle", () => {
    assert.deepEqual(
      getBoundingBoxFromPolygon([
        { x: 10, y: 20 },
        { x: 110, y: 20 },
        { x: 110, y: 70 },
        { x: 10, y: 70 },
      ]),
      { x: 10, y: 20, width: 100, height: 50 },
    );
  });
});
