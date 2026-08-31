/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import { Ruler, Check, AlertTriangle, Sparkles, CheckCircle2, Sliders, Scissors } from "lucide-react";
import { BaseDocSize, ZoneSettings } from "../types";
import { analyzeCurveSizeAndOpticalSpacing, CurveSizeAnalysis } from "../utils/curveSizeAdvisor";

interface CurveSizeRecommenderProps {
  shapeElement: SVGElement | null;
  zoneSettings: ZoneSettings | null;
  baseDocSize: BaseDocSize;
  onUpdateSettings: (settings: ZoneSettings) => void;
  showStatus?: (msg: string, type?: "success" | "error" | "info") => void;
}

export const CurveSizeRecommender: React.FC<CurveSizeRecommenderProps> = ({
  shapeElement,
  zoneSettings,
  baseDocSize,
  onUpdateSettings,
  showStatus,
}) => {
  const analysis: CurveSizeAnalysis | null = useMemo(() => {
    if (!zoneSettings) return null;

    let vb = { width: 500, height: 500 };
    if (shapeElement) {
      const svgRoot = shapeElement.ownerSVGElement || shapeElement.closest("svg");
      if (svgRoot && svgRoot.viewBox && svgRoot.viewBox.baseVal && svgRoot.viewBox.baseVal.width > 0) {
        vb = {
          width: svgRoot.viewBox.baseVal.width,
          height: svgRoot.viewBox.baseVal.height,
        };
      }
    }

    return analyzeCurveSizeAndOpticalSpacing(shapeElement, zoneSettings, baseDocSize, vb);
  }, [shapeElement, zoneSettings, baseDocSize]);

  if (!zoneSettings || !analysis) return null;

  const isMatchingRecommended =
    Math.abs(zoneSettings.windowWidth - analysis.recommendedWindowWidthMm) < 0.05 &&
    zoneSettings.frameCount === analysis.recommendedFrameCount;

  const handleApplyRecommended = () => {
    onUpdateSettings({
      ...zoneSettings,
      windowWidth: analysis.recommendedWindowWidthMm,
      frameCount: analysis.recommendedFrameCount,
    });

    showStatus?.(
      `✓ Applied recommended optical specs for curve (${analysis.recommendedFrameCount} frames, ${analysis.recommendedWindowWidthMm}mm pitch)!`,
      "success"
    );
  };

  return (
    <div className="p-3 bg-[#080d16] border border-[#00f0ff]/30 rounded flex flex-col gap-2.5 shadow-md">
      {/* Header with Physical Dimensions Tag */}
      <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
        <div className="flex items-center gap-1.5 font-mono text-[10px] font-black text-[#00f0ff] uppercase tracking-wider">
          <Ruler className="w-3.5 h-3.5 text-[#00f0ff]" />
          <span>CURVE SIZE & OPTICAL SPECS</span>
        </div>
        <span className="text-[9px] font-mono bg-[#00f0ff]/10 text-[#00f0ff] px-1.5 py-0.5 rounded font-bold">
          {analysis.areaPercentOfWindow}% of window
        </span>
      </div>

      {/* Real-world Dimension Metrics */}
      <div className="grid grid-cols-2 gap-1.5 text-[9px] font-mono bg-black/60 p-2 rounded border border-[#1e293b]">
        <div>
          <span className="text-stone-500 block uppercase">PHYSICAL WIDTH:</span>
          <span className="text-white font-bold">
            {analysis.curveWidthMm} mm <span className="text-stone-400">({analysis.curveWidthIn}")</span>
          </span>
        </div>
        <div>
          <span className="text-stone-500 block uppercase">PHYSICAL HEIGHT:</span>
          <span className="text-white font-bold">
            {analysis.curveHeightMm} mm <span className="text-stone-400">({analysis.curveHeightIn}")</span>
          </span>
        </div>
      </div>

      {/* Recommended Calibration Card */}
      <div className="bg-black/90 p-2.5 rounded border border-[#333] flex flex-col gap-2">
        <div className="flex items-center justify-between text-[9px] font-mono">
          <span className="text-stone-400 uppercase font-bold flex items-center gap-1">
            <span>RECOMMENDED FOR THIS SIZE:</span>
          </span>
          <span className="text-[#ff007f] font-black">
            {analysis.recommendedFrameCount} FRAMES • {analysis.recommendedWindowWidthMm}MM PITCH
          </span>
        </div>

        <div className="flex items-center justify-between text-[8.5px] font-mono text-stone-400">
          <span>Target Slit Aperture:</span>
          <strong className="text-[#00f0ff]">{analysis.recommendedSlitWidthMm} mm (Blade safe)</strong>
        </div>

        {/* 1-Click Apply button if not already matching */}
        {!isMatchingRecommended ? (
          <button
            onClick={handleApplyRecommended}
            className="w-full py-1.5 px-2 bg-gradient-to-r from-[#00f0ff] to-[#00c8d6] hover:opacity-95 active:scale-95 text-black font-black font-mono text-[9.5px] uppercase tracking-wider rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(0,240,255,0.3)]"
            title="Apply optimal slit spacing and frame count calculated from the physical curve size"
          >
            <Check className="w-3 h-3 text-black stroke-[3]" />
            <span>APPLY RECOMMENDED ({analysis.recommendedFrameCount} FRAMES, {analysis.recommendedWindowWidthMm}MM)</span>
          </button>
        ) : (
          <div className="py-1 px-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[9px] font-bold rounded flex items-center justify-center gap-1.5 text-center">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>CALIBRATED TO OPTIMAL CURVE RESOLUTION</span>
          </div>
        )}
      </div>

      {/* Slit Aperture Feedback & Vinyl Blade Feasibility */}
      <div
        className={`p-1.5 rounded text-[8.5px] font-mono flex items-start gap-1.5 leading-tight ${
          analysis.status === "too_fine"
            ? "bg-rose-950/40 border border-rose-500/40 text-rose-300"
            : analysis.status === "coarse"
            ? "bg-amber-950/40 border border-amber-500/40 text-amber-300"
            : "bg-emerald-950/30 border border-emerald-500/30 text-emerald-300"
        }`}
      >
        {analysis.status === "too_fine" ? (
          <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
        ) : (
          <Scissors className="w-3 h-3 text-inherit shrink-0 mt-0.5" />
        )}
        <span>{analysis.statusMessage}</span>
      </div>
    </div>
  );
};
