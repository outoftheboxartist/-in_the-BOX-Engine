/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseDocSize, ZoneSettings } from "../types";

export interface CurveSizeAnalysis {
  curveWidthMm: number;
  curveHeightMm: number;
  curveWidthIn: number;
  curveHeightIn: number;
  areaPercentOfWindow: number;
  
  // Optical Recommendations
  recommendedWindowWidthMm: number;
  recommendedFrameCount: number;
  recommendedSlitWidthMm: number;
  
  // Current settings evaluation
  currentSlitWidthMm: number;
  status: "optimal" | "too_fine" | "coarse";
  statusMessage: string;
  cuttingFeasibility: "excellent" | "good" | "difficult";
}

export const BASE_WINDOW_PRESETS: BaseDocSize[] = [
  { label: "A4 (210 × 297 mm)", widthInches: 8.27, heightInches: 11.69, unit: "mm" },
  { label: '8" × 8" (203 × 203 mm)', widthInches: 8, heightInches: 8, unit: "in" },
  { label: '10" × 10" (254 × 254 mm)', widthInches: 10, heightInches: 10, unit: "in" },
  { label: '12" × 12" (305 × 305 mm) [Cricut Mat]', widthInches: 12, heightInches: 12, unit: "in" },
  { label: '11" × 14" (279 × 356 mm)', widthInches: 11, heightInches: 14, unit: "in" },
  { label: '12" × 24" (305 × 610 mm) [Large Mat]', widthInches: 12, heightInches: 24, unit: "in" },
  { label: '16" × 20" (406 × 508 mm)', widthInches: 16, heightInches: 20, unit: "in" },
  { label: '18" × 24" (457 × 610 mm) [Poster]', widthInches: 18, heightInches: 24, unit: "in" },
  { label: '24" × 24" (610 × 610 mm) [Large Frame]', widthInches: 24, heightInches: 24, unit: "in" },
  { label: "A3 (297 × 420 mm)", widthInches: 11.69, heightInches: 16.54, unit: "mm" },
  { label: "300 × 300 mm [Standard Square]", widthInches: 11.81, heightInches: 11.81, unit: "mm" },
  { label: "500 × 500 mm [Gallery Display]", widthInches: 19.68, heightInches: 19.68, unit: "mm" },
];

export function analyzeCurveSizeAndOpticalSpacing(
  shapeEl: SVGElement | null,
  zoneSettings: ZoneSettings,
  baseDocSize: BaseDocSize,
  viewBox: { width: number; height: number } = { width: 500, height: 500 }
): CurveSizeAnalysis {
  let bbox = { x: 0, y: 0, width: 200, height: 200 };

  if (shapeEl) {
    try {
      if ("getBBox" in shapeEl && typeof (shapeEl as any).getBBox === "function") {
        const rawBbox = (shapeEl as SVGGraphicsElement).getBBox();
        if (rawBbox && rawBbox.width > 0 && rawBbox.height > 0) {
          bbox = {
            x: rawBbox.x,
            y: rawBbox.y,
            width: rawBbox.width,
            height: rawBbox.height,
          };
        }
      }
    } catch {
      // fallback to estimated box
    }
  }

  // Calculate real-world physical dimensions based on base workspace print window
  const windowWidthMm = baseDocSize.widthInches * 25.4;
  const windowHeightMm = baseDocSize.heightInches * 25.4;

  const mmPerSvgUnitX = windowWidthMm / Math.max(viewBox.width, 10);
  const mmPerSvgUnitY = windowHeightMm / Math.max(viewBox.height, 10);

  const curveWidthMm = Math.max(bbox.width * mmPerSvgUnitX, 5);
  const curveHeightMm = Math.max(bbox.height * mmPerSvgUnitY, 5);
  const curveWidthIn = curveWidthMm / 25.4;
  const curveHeightIn = curveHeightMm / 25.4;

  const windowAreaMm2 = windowWidthMm * windowHeightMm;
  const curveAreaMm2 = curveWidthMm * curveHeightMm;
  const areaPercentOfWindow = Math.min(100, Math.round((curveAreaMm2 / windowAreaMm2) * 100));

  // Determine physical curve size tier
  const maxSpanMm = Math.max(curveWidthMm, curveHeightMm);

  let recommendedPitchMm = 1.0;
  let recommendedFrames = 6;

  if (maxSpanMm < 40) {
    // Small intricate shape (< 1.5 inches)
    recommendedPitchMm = 0.8;
    recommendedFrames = 4;
  } else if (maxSpanMm < 90) {
    // Small-medium shape (1.5 - 3.5 inches)
    recommendedPitchMm = 1.0;
    recommendedFrames = 6;
  } else if (maxSpanMm < 180) {
    // Medium-large shape (3.5 - 7 inches)
    recommendedPitchMm = 1.25;
    recommendedFrames = 6;
  } else if (maxSpanMm < 300) {
    // Large shape (7 - 12 inches)
    recommendedPitchMm = 1.5;
    recommendedFrames = 8;
  } else {
    // Huge poster/frame (> 12 inches)
    recommendedPitchMm = 2.0;
    recommendedFrames = 8;
  }

  const recommendedSlitWidthMm = Number((recommendedPitchMm / recommendedFrames).toFixed(2));
  const currentSlitWidthMm = Number((zoneSettings.windowWidth / Math.max(zoneSettings.frameCount, 1)).toFixed(2));

  let status: "optimal" | "too_fine" | "coarse" = "optimal";
  let statusMessage = "Slit width is optimal for vinyl cutting and crisp optical barrier clarity.";
  let cuttingFeasibility: "excellent" | "good" | "difficult" = "excellent";

  if (currentSlitWidthMm < 0.16) {
    status = "too_fine";
    statusMessage = `Slit aperture (${currentSlitWidthMm}mm) is very thin! May be difficult for standard vinyl cutters. Increase pitch or reduce frames.`;
    cuttingFeasibility = "difficult";
  } else if (currentSlitWidthMm > 0.45) {
    status = "coarse";
    statusMessage = `Slit aperture (${currentSlitWidthMm}mm) is generous. Very easy to weed and cut; motion will appear bold.`;
    cuttingFeasibility = "excellent";
  } else {
    status = "optimal";
    statusMessage = `Slit aperture (${currentSlitWidthMm}mm) is well-balanced for sharp scanimation and vinyl blade precision.`;
    cuttingFeasibility = "good";
  }

  return {
    curveWidthMm: Number(curveWidthMm.toFixed(1)),
    curveHeightMm: Number(curveHeightMm.toFixed(1)),
    curveWidthIn: Number(curveWidthIn.toFixed(2)),
    curveHeightIn: Number(curveHeightIn.toFixed(2)),
    areaPercentOfWindow,
    recommendedWindowWidthMm: recommendedPitchMm,
    recommendedFrameCount: recommendedFrames,
    recommendedSlitWidthMm,
    currentSlitWidthMm,
    status,
    statusMessage,
    cuttingFeasibility,
  };
}
