/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ZoneSettings } from "../types";

export interface LineCoords {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SlicesData {
  lines: LineCoords[];
  lineThickness: number;
  diag: number;
  cx: number;
  cy: number;
  pitch: number;
}

/**
 * Checks if a point is inside a polygon using ray-casting.
 */
export function isPointInPolygon(p: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y))
        && (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Clips a line segment (x1, y1) to (x2, y2) against a closed polygon,
 * returning the segments that lie inside the polygon.
 */
export function clipLineToPolygon(
  line: LineCoords,
  poly: { x: number; y: number }[]
): LineCoords[] {
  if (poly.length < 3) return [];

  const tValues: number[] = [0, 1]; // always evaluate endpoints

  // Find all intersections of segment with the polygon edges
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const cx = poly[i].x;
    const cy = poly[i].y;
    const dx = poly[j].x;
    const dy = poly[j].y;

    const ax = line.x1;
    const ay = line.y1;
    const bx = line.x2;
    const by = line.y2;

    const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(denom) > 1e-6) {
      const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom;
      const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom;

      if (t >= -1e-5 && t <= 1 + 1e-5 && u >= -1e-5 && u <= 1 + 1e-5) {
        const clampT = Math.max(0, Math.min(1, t));
        tValues.push(clampT);
      }
    }
  }

  // Sort t values and remove duplicates
  tValues.sort((a, b) => a - b);
  const uniqueTs: number[] = [];
  for (let i = 0; i < tValues.length; i++) {
    if (uniqueTs.length === 0 || tValues[i] - uniqueTs[uniqueTs.length - 1] > 1e-5) {
      uniqueTs.push(tValues[i]);
    }
  }

  const result: LineCoords[] = [];

  // Check each sub-interval
  for (let i = 0; i < uniqueTs.length - 1; i++) {
    const tStart = uniqueTs[i];
    const tEnd = uniqueTs[i + 1];
    
    // Ignore extremely tiny segments
    if (tEnd - tStart < 1e-4) continue;

    const tMid = (tStart + tEnd) / 2;
    const mx = line.x1 + tMid * (line.x2 - line.x1);
    const my = line.y1 + tMid * (line.y2 - line.y1);

    if (isPointInPolygon({ x: mx, y: my }, poly)) {
      result.push({
        x1: line.x1 + tStart * (line.x2 - line.x1),
        y1: line.y1 + tStart * (line.y2 - line.y1),
        x2: line.x1 + tEnd * (line.x2 - line.x1),
        y2: line.y1 + tEnd * (line.y2 - line.y1),
      });
    }
  }

  return result;
}

/**
 * Extracts a coordinate polygon from an SVG shape element.
 * If applyTransforms is true, applies parent group & element transform matrices
 * so that polygon points are in root SVG canvas coordinates.
 */
export function getPolygonFromElement(el: SVGElement, applyTransforms = true): { x: number; y: number }[] {
  const poly: { x: number; y: number }[] = [];
  const tagName = el.tagName.toLowerCase();

  try {
    if (tagName === "rect") {
      const x = parseFloat(el.getAttribute("x") || "0");
      const y = parseFloat(el.getAttribute("y") || "0");
      const w = parseFloat(el.getAttribute("width") || "0");
      const h = parseFloat(el.getAttribute("height") || "0");
      poly.push({ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h });
    } else if (tagName === "circle") {
      const cx = parseFloat(el.getAttribute("cx") || "0");
      const cy = parseFloat(el.getAttribute("cy") || "0");
      const r = parseFloat(el.getAttribute("r") || "0");
      for (let i = 0; i < 128; i++) {
        const angle = (i / 128) * Math.PI * 2;
        poly.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
      }
    } else if (tagName === "ellipse") {
      const cx = parseFloat(el.getAttribute("cx") || "0");
      const cy = parseFloat(el.getAttribute("cy") || "0");
      const rx = parseFloat(el.getAttribute("rx") || "0");
      const ry = parseFloat(el.getAttribute("ry") || "0");
      for (let i = 0; i < 128; i++) {
        const angle = (i / 128) * Math.PI * 2;
        poly.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
      }
    } else if (tagName === "polygon" || tagName === "polyline") {
      const pointsStr = el.getAttribute("points") || "";
      const pairs = pointsStr.trim().split(/[\s,]+/);
      for (let i = 0; i < pairs.length - 1; i += 2) {
        const x = parseFloat(pairs[i]);
        const y = parseFloat(pairs[i + 1]);
        if (!isNaN(x) && !isNaN(y)) {
          poly.push({ x, y });
        }
      }
    } else if (tagName === "path") {
      const pathEl = el as unknown as SVGPathElement;
      if (typeof pathEl.getTotalLength === "function") {
        const length = pathEl.getTotalLength();
        if (length > 0) {
          const numSamples = Math.min(600, Math.max(150, Math.floor(length / 2)));
          for (let i = 0; i <= numSamples; i++) {
            const p = pathEl.getPointAtLength((i / numSamples) * length);
            poly.push({ x: p.x, y: p.y });
          }
        }
      }
    }

    // Apply SVG transform matrix to convert local points into root SVG coordinates
    if (applyTransforms && poly.length > 0) {
      try {
        const svgEl = el.ownerSVGElement || (el.tagName.toLowerCase() === "svg" ? (el as unknown as SVGSVGElement) : null);
        if (svgEl && typeof (el as any).getScreenCTM === "function") {
          const svgCtm = svgEl.getScreenCTM();
          const elCtm = (el as any).getScreenCTM();
          if (svgCtm && elCtm) {
            const matrix = svgCtm.inverse().multiply(elCtm);
            return poly.map((pt) => ({
              x: pt.x * matrix.a + pt.y * matrix.c + matrix.e,
              y: pt.x * matrix.b + pt.y * matrix.d + matrix.f,
            }));
          }
        }
      } catch (transformErr) {
        // Continue with local polygon if matrix multiplication is not accessible
      }
    }
  } catch (err) {
    console.warn("Polygon mapping error on element:", err);
  }

  return poly;
}

/**
 * Calculates the bounding box of a polygon.
 */
export function getBoundingBoxFromPolygon(poly: { x: number; y: number }[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!poly || poly.length === 0) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of poly) {
    if (typeof pt.x === "number" && !isNaN(pt.x) && pt.x < minX) minX = pt.x;
    if (typeof pt.y === "number" && !isNaN(pt.y) && pt.y < minY) minY = pt.y;
    if (typeof pt.x === "number" && !isNaN(pt.x) && pt.x > maxX) maxX = pt.x;
    if (typeof pt.y === "number" && !isNaN(pt.y) && pt.y > maxY) maxY = pt.y;
  }

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/**
 * Extracts complete shape geometry (polygon and root bounding box) from an SVG element.
 */
export function getShapeGeometry(el: SVGElement): {
  bbox: { x: number; y: number; width: number; height: number };
  polygon: { x: number; y: number }[];
} {
  const polygon = getPolygonFromElement(el, true);
  const bbox = getBoundingBoxFromPolygon(polygon);
  return { bbox, polygon };
}

/**
 * Generates parallel lines centered at the bounding box of a shape,
 * rotated perpendicular to the reveal direction.
 * 
 * @param bbox Bounding box dimensions of the target shape
 * @param settings Calibration parameters for the zone
 * @param scale Pixels per millimeter
 * @param phase Shift factor from 0.0 to 1.0 of the repeating period
 * @param useBars If true, calculates opacity bars instead of transparent windows
 */
export function generateLinesData(
  bbox: { x: number; y: number; width: number; height: number },
  settings: ZoneSettings,
  scale: number,
  phase: number,
  useBars = false
): SlicesData {
  const frameCount = Math.max(1, settings?.frameCount || 6);
  const windowWidth = Math.max(0.01, settings?.windowWidth || 0.5);
  const validScale = Math.max(0.001, scale || 1.0);
  const thetaDeg = settings?.revealDirection?.angle || 0;
  
  // Calculate center of shape bounding box
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  
  // Radius / diagonal to cover the shape's full bounding area
  const diag = Math.max(1, Math.sqrt(bbox.width * bbox.width + bbox.height * bbox.height) * 1.2); // 20% margin to prevent edge clipping

  // The angle of reveal is thetaDeg.
  // The parallel lines (slits) run perpendicular to the movement direction.
  const angleRad = (thetaDeg * Math.PI) / 180;
  
  // Unit vectors
  const nx = Math.cos(angleRad); // normal displacement vector (X)
  const ny = Math.sin(angleRad); // normal displacement vector (Y)
  
  const tx = -Math.sin(angleRad); // tangent along the line vector (X)
  const ty = Math.cos(angleRad);  // tangent along the line vector (Y)

  // Spacing (pitch) = FrameCount * windowWidth in pixels
  const pitch = Math.max(0.1, frameCount * windowWidth * validScale);
  
  // Line width
  let lineThickness = Math.max(0.1, windowWidth * validScale); // slits width
  if (useBars) {
    lineThickness = Math.max(0.1, pitch - lineThickness); // bars width
  }

  const lines: LineCoords[] = [];
  
  // Span far enough along both normal directions to completely blanket the shape (capped at 600 to prevent infinite loop or freezing)
  const steps = Math.min(600, Math.max(1, Math.ceil(diag / pitch) + 2));

  for (let i = -steps; i <= steps; i++) {
    // Offset perpendicular displacement in pixels
    const offset = (i + phase) * pitch;
    
    // Shifted point along normal direction
    const px = cx + offset * nx;
    const py = cy + offset * ny;

    // Extend line along tangent direction to cross outer boundaries
    const x1 = px - diag * tx;
    const y1 = py - diag * ty;
    const x2 = px + diag * tx;
    const y2 = py + diag * ty;

    lines.push({ x1, y1, x2, y2 });
  }

  return {
    lines,
    lineThickness,
    diag,
    cx,
    cy,
    pitch,
  };
}
