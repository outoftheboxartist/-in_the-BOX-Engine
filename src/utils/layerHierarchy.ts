/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SVGZoneInfo, ZoneSettings } from "../types";
import { isPointInPolygon } from "./slicing";

export interface ZoneGeometry {
  bbox: { x: number; y: number; width: number; height: number };
  polygon: { x: number; y: number }[];
}

/**
 * Calculates absolute 2D polygon area using Shoelace formula.
 */
export function calculatePolygonArea(poly: { x: number; y: number }[]): number {
  if (poly.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y;
    area -= poly[j].x * poly[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Checks if polygon B is an island nested inside / on top of polygon A.
 */
export function isPolygonNestedInside(
  innerPoly: { x: number; y: number }[],
  outerPoly: { x: number; y: number }[]
): boolean {
  if (innerPoly.length < 3 || outerPoly.length < 3) return false;
  const innerArea = calculatePolygonArea(innerPoly);
  const outerArea = calculatePolygonArea(outerPoly);
  if (innerArea >= outerArea * 0.98) return false;

  // Check centroid of inner polygon
  let cx = 0, cy = 0;
  innerPoly.forEach((p) => {
    cx += p.x;
    cy += p.y;
  });
  cx /= innerPoly.length;
  cy /= innerPoly.length;

  if (isPointInPolygon({ x: cx, y: cy }, outerPoly)) {
    return true;
  }

  // Sample multiple vertices
  let insideCount = 0;
  const samples = Math.min(innerPoly.length, 8);
  for (let i = 0; i < samples; i++) {
    const idx = Math.floor((i * innerPoly.length) / samples);
    if (isPointInPolygon(innerPoly[idx], outerPoly)) {
      insideCount++;
    }
  }

  return insideCount >= samples * 0.5;
}

/**
 * Checks if a zone is a solid static base layer (0 or 1 frames, isSolid flag, or SOLID in name).
 */
export function isZoneSolid(
  zone?: SVGZoneInfo | null,
  settings?: ZoneSettings | null
): boolean {
  if (!zone && !settings) return false;
  if (settings?.isSolid) return true;
  if (settings?.frameCount !== undefined && settings.frameCount <= 1) return true;
  const name = (settings?.zoneName || zone?.defaultName || zone?.id || "").toUpperCase();
  if (name.includes("SOLID") || name.includes("_SOLID") || name.includes("BACKGROUND") || name.includes("BASE")) return true;
  return false;
}

/**
 * Sorts SVG zones in physical bottom-to-top layer order.
 * - Solid layers (0/1 frames, isSolid, or SOLID in name) are ALWAYS moved to the very background (bottom, rendered first).
 * - Enclosing / larger background regions are placed beneath smaller inner detail / island curves.
 * - Smaller island / detail shapes are placed on top (rendered after, cutting through layers beneath and receiving click priority).
 */
export function sortZonesByLayerOrder(
  zones: SVGZoneInfo[],
  geometryMap: Record<string, ZoneGeometry>,
  zoneSettings: Record<string, ZoneSettings> = {}
): SVGZoneInfo[] {
  return [...zones].sort((a, b) => {
    const geomA = geometryMap[a.id];
    const geomB = geometryMap[b.id];
    const setA = zoneSettings[a.id];
    const setB = zoneSettings[b.id];

    const isSolidA = isZoneSolid(a, setA);
    const isSolidB = isZoneSolid(b, setB);

    // Rule 1: Solid base layers always go to the background (bottom)
    if (isSolidA && !isSolidB) {
      return -1; // A is background (bottom)
    }
    if (!isSolidA && isSolidB) {
      return 1; // B is background (bottom)
    }

    if (!geomA || !geomB) return 0;

    const areaA = calculatePolygonArea(geomA.polygon);
    const areaB = calculatePolygonArea(geomB.polygon);

    // Rule 2: If B is nested inside A, A is background (bottom, rendered first)
    if (isPolygonNestedInside(geomB.polygon, geomA.polygon)) {
      return -1; // A comes first (bottom)
    }

    // Rule 3: If A is nested inside B, B is background (bottom, rendered first)
    if (isPolygonNestedInside(geomA.polygon, geomB.polygon)) {
      return 1; // B comes first (bottom)
    }

    // Rule 4: Sort by descending area (larger regions at the bottom)
    return areaB - areaA;
  });
}
