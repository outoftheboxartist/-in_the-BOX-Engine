/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { isPointInPolygon, getBoundingBoxFromPolygon, getPolygonFromElement } from "./slicing";

export interface OverlapAnalysisResult {
  hasOverlaps: boolean;
  totalShapes: number;
  overlappingCount: number;
  trimmedShapeIndices: number[];
}

/**
 * Calculates polygon area using the standard Shoelace formula.
 */
export function calculatePolygonArea(poly: { x: number; y: number }[]): number {
  if (poly.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y;
    area -= poly[j].x * poly[i].y;
  }
  return Math.abs(area) / 2.0;
}

/**
 * Checks the overlap ratio between two closed polygons.
 * Returns overlapA (fraction of A inside B) and overlapB (fraction of B inside A).
 */
export function calculatePolygonOverlap(
  polyA: { x: number; y: number }[],
  polyB: { x: number; y: number }[],
  sampleGridResolution = 18
): { overlapA: number; overlapB: number } {
  if (polyA.length < 3 || polyB.length < 3) {
    return { overlapA: 0, overlapB: 0 };
  }

  const boxA = getBoundingBoxFromPolygon(polyA);
  const boxB = getBoundingBoxFromPolygon(polyB);

  // 1. Fast Axis-Aligned Bounding Box intersection rejection
  const intersectMinX = Math.max(boxA.x, boxB.x);
  const intersectMinY = Math.max(boxA.y, boxB.y);
  const intersectMaxX = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
  const intersectMaxY = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

  if (intersectMinX >= intersectMaxX || intersectMinY >= intersectMaxY) {
    return { overlapA: 0, overlapB: 0 };
  }

  // 2. Vertex containment fast check
  let aInBCount = 0;
  for (const pt of polyA) {
    if (isPointInPolygon(pt, polyB)) aInBCount++;
  }
  const aInBRatio = aInBCount / polyA.length;

  let bInACount = 0;
  for (const pt of polyB) {
    if (isPointInPolygon(pt, polyA)) bInACount++;
  }
  const bInARatio = bInACount / polyB.length;

  // If almost all vertices of A are in B, A is nested inside B
  if (aInBRatio > 0.75) {
    return { overlapA: 1.0, overlapB: aInBRatio };
  }
  if (bInARatio > 0.75) {
    return { overlapA: bInARatio, overlapB: 1.0 };
  }

  // 3. Dense 2D grid sampling across the bounding box intersection region
  const stepX = (intersectMaxX - intersectMinX) / sampleGridResolution;
  const stepY = (intersectMaxY - intersectMinY) / sampleGridResolution;

  let inACount = 0;
  let inBCount = 0;
  let inBothCount = 0;

  for (let ix = 0; ix <= sampleGridResolution; ix++) {
    const x = intersectMinX + ix * stepX;
    for (let iy = 0; iy <= sampleGridResolution; iy++) {
      const y = intersectMinY + iy * stepY;
      const inA = isPointInPolygon({ x, y }, polyA);
      const inB = isPointInPolygon({ x, y }, polyB);

      if (inA) inACount++;
      if (inB) inBCount++;
      if (inA && inB) inBothCount++;
    }
  }

  const overlapA = inACount > 0 ? inBothCount / inACount : aInBRatio;
  const overlapB = inBCount > 0 ? inBothCount / inBCount : bInARatio;

  return {
    overlapA: Math.max(overlapA, aInBRatio),
    overlapB: Math.max(overlapB, bInARatio),
  };
}

/**
 * Detects whether an SVG document has overlapping or duplicate curves.
 */
export function detectSvgOverlaps(
  svgString: string,
  overlapThreshold = 0.40
): OverlapAnalysisResult {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");
    const shapeElements = Array.from(
      doc.querySelectorAll("path, polygon, rect, circle, ellipse")
    ) as SVGElement[];

    if (shapeElements.length <= 1) {
      return {
        hasOverlaps: false,
        totalShapes: shapeElements.length,
        overlappingCount: 0,
        trimmedShapeIndices: [],
      };
    }

    const polygons = shapeElements.map((el) => getPolygonFromElement(el, false));
    const trimmedIndices = new Set<number>();

    for (let i = 0; i < polygons.length; i++) {
      if (trimmedIndices.has(i)) continue;
      const polyA = polygons[i];
      if (polyA.length < 3) continue;

      for (let j = i + 1; j < polygons.length; j++) {
        if (trimmedIndices.has(j)) continue;
        const polyB = polygons[j];
        if (polyB.length < 3) continue;

        const { overlapA, overlapB } = calculatePolygonOverlap(polyA, polyB);

        // If either shape overlaps significantly with the other (> overlapThreshold)
        if (overlapA > overlapThreshold || overlapB > overlapThreshold) {
          // If shape J is smaller or nested inside shape I, trim shape J
          const areaA = calculatePolygonArea(polyA);
          const areaB = calculatePolygonArea(polyB);

          if (areaB <= areaA) {
            trimmedIndices.add(j);
          } else {
            trimmedIndices.add(i);
            break;
          }
        }
      }
    }

    const trimmedArray = Array.from(trimmedIndices);
    return {
      hasOverlaps: trimmedArray.length > 0,
      totalShapes: shapeElements.length,
      overlappingCount: trimmedArray.length,
      trimmedShapeIndices: trimmedArray,
    };
  } catch (err) {
    console.error("Error analyzing SVG overlaps:", err);
    return {
      hasOverlaps: false,
      totalShapes: 0,
      overlappingCount: 0,
      trimmedShapeIndices: [],
    };
  }
}

/**
 * Trims and removes all overlapping or nested duplicate curves from an SVG document,
 * returning a clean SVG string with mutually disjoint closed curves.
 */
export function trimOverlappingSvgCurves(
  svgString: string,
  overlapThreshold = 0.40
): {
  cleanedSvg: string;
  trimmedCount: number;
  remainingCount: number;
} {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");
    const shapeElements = Array.from(
      doc.querySelectorAll("path, polygon, rect, circle, ellipse")
    ) as SVGElement[];

    if (shapeElements.length <= 1) {
      return {
        cleanedSvg: svgString,
        trimmedCount: 0,
        remainingCount: shapeElements.length,
      };
    }

    const polygons = shapeElements.map((el) => getPolygonFromElement(el, false));
    const toRemoveIndices = new Set<number>();

    for (let i = 0; i < polygons.length; i++) {
      if (toRemoveIndices.has(i)) continue;
      const polyA = polygons[i];
      if (polyA.length < 3) continue;

      for (let j = i + 1; j < polygons.length; j++) {
        if (toRemoveIndices.has(j)) continue;
        const polyB = polygons[j];
        if (polyB.length < 3) continue;

        const { overlapA, overlapB } = calculatePolygonOverlap(polyA, polyB);

        if (overlapA > overlapThreshold || overlapB > overlapThreshold) {
          const areaA = calculatePolygonArea(polyA);
          const areaB = calculatePolygonArea(polyB);

          // Remove the duplicate or heavily overlapping curve
          if (areaB <= areaA) {
            toRemoveIndices.add(j);
          } else {
            toRemoveIndices.add(i);
            break;
          }
        }
      }
    }

    // Remove the overlapping shape elements from the DOM
    const sortedToRemove = Array.from(toRemoveIndices).sort((a, b) => b - a);
    for (const idx of sortedToRemove) {
      const el = shapeElements[idx];
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }

    const serializer = new XMLSerializer();
    const cleanedSvg = serializer.serializeToString(doc);

    return {
      cleanedSvg,
      trimmedCount: toRemoveIndices.size,
      remainingCount: shapeElements.length - toRemoveIndices.size,
    };
  } catch (err) {
    console.error("Error trimming SVG overlaps:", err);
    return {
      cleanedSvg: svgString,
      trimmedCount: 0,
      remainingCount: 0,
    };
  }
}
