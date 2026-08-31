/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Sliders,
  HelpCircle,
  FileText,
  Settings,
  Sparkles,
  RefreshCcw,
  Tag,
  Scissors,
  Eye,
  EyeOff,
  Play,
  Cpu,
  Download,
  Wand2,
  Grid,
  Layers,
  Square,
  Paintbrush,
  Check,
} from "lucide-react";
import { ZoneSettings, BaseDocSize } from "../types";
import { VectorSelector } from "./VectorSelector";
import { CurveSizeRecommender } from "./CurveSizeRecommender";

interface ZonePropertiesPanelProps {
  selectedZoneSettings: ZoneSettings | null;
  onUpdateSettings: (settings: ZoneSettings) => void;
  onResetToDefaultName: () => void;
  originalDefaultName: string | null;
  baseDocSize?: BaseDocSize;
  isSlicingPreviewActive?: boolean;
  setIsSlicingPreviewActive?: (val: boolean) => void;
  slicingPhase?: number;
  setSlicingPhase?: (val: number) => void;
  slicingScale?: number;
  setSlicingScale?: (val: number) => void;
  slicingMode?: "cutting" | "bars" | "wireframe" | "both";
  setSlicingMode?: (val: "cutting" | "bars" | "wireframe" | "both") => void;
  onExportSlices?: () => void;
  onExportCricutSlices?: () => void;
  onOpenArtworkStudio?: () => void;
  showStatus?: (msg: string, type?: "success" | "error" | "info") => void;
  onRenameZone?: (zoneId: string, newName: string) => void;
  onChangeZoneFrames?: (zoneId: string, count: number) => void;
}

export function ZonePropertiesPanel({
  selectedZoneSettings,
  onUpdateSettings,
  onResetToDefaultName,
  originalDefaultName,
  baseDocSize = { label: "A4 (210 × 297 mm)", widthInches: 8.27, heightInches: 11.69, unit: "mm" },
  isSlicingPreviewActive = true,
  setIsSlicingPreviewActive,
  slicingPhase = 0.0,
  setSlicingPhase,
  slicingScale = 1.0,
  setSlicingScale,
  slicingMode = "wireframe",
  setSlicingMode,
  onExportSlices,
  onExportCricutSlices,
  onOpenArtworkStudio,
  showStatus,
  onRenameZone,
  onChangeZoneFrames,
}: ZonePropertiesPanelProps) {
  const [showHelp, setShowHelp] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [shapeEl, setShapeEl] = useState<SVGElement | null>(null);
  const animationRef = React.useRef<number | null>(null);

  // Update target SVG element reference when selected zone changes
  useEffect(() => {
    if (selectedZoneSettings?.zoneId) {
      const el = document.querySelector<SVGElement>(`[data-zone-id="${selectedZoneSettings.zoneId}"]`);
      setShapeEl(el);
    } else {
      setShapeEl(null);
    }
  }, [selectedZoneSettings?.zoneId]);

  // Play / Slide animation loop
  const toggleAnimation = () => {
    if (isAnimating) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setIsAnimating(false);
    } else {
      setIsAnimating(true);
      const start = Date.now();
      const run = () => {
        const elapsed = Date.now() - start;
        // Cycle phase every 3 seconds
        const newPhase = (elapsed % 3000) / 3000;
        if (setSlicingPhase) {
          setSlicingPhase(newPhase);
        }
        animationRef.current = requestAnimationFrame(run);
      };
      animationRef.current = requestAnimationFrame(run);
    }
  };

  React.useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  if (!selectedZoneSettings) {
    return (
      <div className="w-full md:w-80 lg:w-[340px] h-full border-t md:border-t-0 md:border-l border-[#262626] bg-[#0c0c0c] p-6 flex flex-col justify-center items-center text-center">
        <div className="w-12 h-12 rounded bg-[#121212] border border-[#262626] flex items-center justify-center text-[#ff007f] mb-4 shadow-xl">
          <Sliders className="w-5 h-5" />
        </div>
        <h3 className="text-white font-bold font-mono tracking-widest text-xs mb-1 uppercase">
          NO LAYER CALIBRATED
        </h3>
        <p className="text-stone-500 text-[10px] font-mono leading-relaxed uppercase">
          Select any closed path or shape region in the canvas or layers inspector to calibrate scanimation parameters.
        </p>
      </div>
    );
  }

  const handleChange = <K extends keyof ZoneSettings>(key: K, value: ZoneSettings[K]) => {
    onUpdateSettings({
      ...selectedZoneSettings,
      [key]: value,
    });
  };

  const slitWidthMm = (selectedZoneSettings.windowWidth / selectedZoneSettings.frameCount).toFixed(2);
  const dutyDark = Math.round((1 - 1 / selectedZoneSettings.frameCount) * 100);
  const dutyClear = 100 - dutyDark;

  return (
    <div className="w-full md:w-80 lg:w-[340px] h-full border-t md:border-t-0 md:border-l border-[#262626] bg-[#0c0c0c] flex flex-col overflow-hidden select-none">
      {/* Header with Title and Mode */}
      <div className="p-3 border-b border-[#262626] bg-black/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-[#161616] border border-[#262626] text-[#00f0ff]">
            <Settings className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-xs font-mono font-black text-white tracking-wider uppercase">
              ZONE CALIBRATION
            </h2>
            <div className="flex items-center gap-1.5 text-[8.5px] font-mono text-[#00f0ff]">
              <span>ID: {selectedZoneSettings.zoneId}</span>
              <span>•</span>
              <span className="text-[#ff007f]">{selectedZoneSettings.frameCount} PHASES</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowHelp(!showHelp)}
          className="p-1 rounded text-stone-500 hover:text-stone-300 transition-colors"
          title="Toggle instructions"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Parameters Scroll Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        {/* Help Banner if toggled */}
        {showHelp && (
          <div className="p-3 bg-[#0a0a0a] border border-[#262626] rounded text-[10px] font-mono text-stone-400 leading-relaxed uppercase">
            <span className="text-[#00f0ff] font-bold block mb-1">Optical Scanimation Rules:</span>
            1. Scanimation relies on high contrast barrier grids.
            2. Match Window Pitch to your physical clear/black acetate sheet.
            3. Use the Live Wireframe Grid toggle below to inspect cut paths directly on the canvas.
          </div>
        )}

        {/* Curve Dimensions & Recommended Spacing / Frame Count (Physical Size Engine) */}
        <CurveSizeRecommender
          shapeElement={shapeEl}
          zoneSettings={selectedZoneSettings}
          baseDocSize={baseDocSize}
          onUpdateSettings={onUpdateSettings}
          showStatus={showStatus}
        />

        {/* Input: Descriptive Zone Name */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-mono font-bold text-stone-400 flex items-center gap-1 uppercase tracking-widest">
              <Tag className="w-3.5 h-3.5 text-[#00f0ff]" />
              <span>LAYER IDENTIFIER</span>
            </label>
            {originalDefaultName && selectedZoneSettings.zoneName !== originalDefaultName && (
              <button
                onClick={onResetToDefaultName}
                className="text-[9px] font-mono text-[#ff007f] hover:underline flex items-center gap-1 cursor-pointer"
                title="Reset to original layer name"
              >
                <RefreshCcw className="w-2.5 h-2.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
          <input
            id="zone-name-input"
            type="text"
            value={selectedZoneSettings.zoneName}
            onChange={(e) => {
              const val = e.target.value;
              handleChange("zoneName", val);
              if (onRenameZone && selectedZoneSettings.zoneId) {
                onRenameZone(selectedZoneSettings.zoneId, val);
              }
            }}
            className="w-full text-xs bg-[#121212] border border-[#262626] focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff] rounded px-2.5 py-1.5 font-mono text-white focus:outline-none uppercase tracking-wider transition-all"
          />
        </div>

        {/* FRAME INTERPOLATION & CURVE MODE (0 = SOLID) */}
        <div className="flex flex-col gap-2 p-2.5 bg-[#090d16] border border-[#262626] rounded">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-mono font-bold text-stone-300 flex items-center gap-1.5 uppercase tracking-widest">
              <Layers className="w-3.5 h-3.5 text-[#00f0ff]" />
              <span>FRAME COUNT (0 = SOLID)</span>
            </label>
            <span
              className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded transition-all ${
                selectedZoneSettings.frameCount <= 1 || selectedZoneSettings.isSolid
                  ? "bg-[#ff007f]/20 border border-[#ff007f]/60 text-[#ff007f] shadow-[0_0_8px_rgba(255,0,127,0.3)]"
                  : "bg-[#00f0ff]/20 border border-[#00f0ff]/60 text-[#00f0ff] shadow-[0_0_8px_rgba(0,240,255,0.3)]"
              }`}
            >
              {selectedZoneSettings.frameCount <= 1 || selectedZoneSettings.isSolid
                ? `${selectedZoneSettings.frameCount || 0} FRAMES (SOLID CURVE)`
                : `${selectedZoneSettings.frameCount} FRAMES (ANIMATED)`}
            </span>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <input
              id="frame-count-slider"
              type="range"
              min="0"
              max="24"
              step="1"
              value={selectedZoneSettings.frameCount}
              onChange={(e) => {
                const count = Math.max(0, Math.min(24, parseInt(e.target.value, 10) || 0));
                const isSolid = count <= 1;
                handleChange("frameCount", count);
                handleChange("isSolid", isSolid);
                if (isSolid && !selectedZoneSettings.solidColor) {
                  handleChange("solidColor", "#000000");
                }
                if (onChangeZoneFrames && selectedZoneSettings.zoneId) {
                  onChangeZoneFrames(selectedZoneSettings.zoneId, count);
                }
              }}
              className={`flex-1 h-1.5 rounded appearance-none cursor-pointer border border-[#262626] ${
                selectedZoneSettings.frameCount <= 1 || selectedZoneSettings.isSolid
                  ? "accent-[#ff007f] bg-black"
                  : "accent-[#00f0ff] bg-black"
              }`}
            />
            <input
              id="frame-count-input"
              type="number"
              min="0"
              max="24"
              value={selectedZoneSettings.frameCount}
              onChange={(e) => {
                const raw = parseInt(e.target.value, 10);
                const count = isNaN(raw) ? 0 : Math.max(0, Math.min(24, raw));
                const isSolid = count <= 1;
                handleChange("frameCount", count);
                handleChange("isSolid", isSolid);
                if (isSolid && !selectedZoneSettings.solidColor) {
                  handleChange("solidColor", "#000000");
                }
                if (onChangeZoneFrames && selectedZoneSettings.zoneId) {
                  onChangeZoneFrames(selectedZoneSettings.zoneId, count);
                }
              }}
              className={`w-14 text-center text-xs bg-[#121212] border border-[#262626] rounded py-1 font-mono text-stone-200 outline-none ${
                selectedZoneSettings.frameCount <= 1 || selectedZoneSettings.isSolid
                  ? "focus:border-[#ff007f] focus:ring-1 focus:ring-[#ff007f]"
                  : "focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff]"
              }`}
            />
          </div>

          {/* Quick Frame Count Presets */}
          <div className="flex gap-1 pt-1">
            {[
              { count: 0, label: "0 (Solid)" },
              { count: 4, label: "4F" },
              { count: 6, label: "6F" },
              { count: 8, label: "8F" },
              { count: 12, label: "12F" },
              { count: 16, label: "16F" },
            ].map((preset) => {
              const isCurrent = selectedZoneSettings.frameCount === preset.count;
              return (
                <button
                  key={preset.count}
                  type="button"
                  onClick={() => {
                    const isSolid = preset.count <= 1;
                    handleChange("frameCount", preset.count);
                    handleChange("isSolid", isSolid);
                    if (isSolid && !selectedZoneSettings.solidColor) {
                      handleChange("solidColor", "#000000");
                    }
                    if (onChangeZoneFrames && selectedZoneSettings.zoneId) {
                      onChangeZoneFrames(selectedZoneSettings.zoneId, preset.count);
                    }
                  }}
                  className={`flex-1 py-1 text-[9px] font-mono rounded cursor-pointer transition-all ${
                    isCurrent
                      ? preset.count <= 1
                        ? "bg-[#ff007f] text-white font-black shadow-[0_0_8px_rgba(255,0,127,0.4)]"
                        : "bg-[#00f0ff] text-black font-black shadow-[0_0_8px_rgba(0,240,255,0.4)]"
                      : "bg-[#141a24] text-stone-400 hover:text-white border border-[#222]"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Solid Curve Color Controls (Shown when frameCount <= 1 or isSolid) */}
          {selectedZoneSettings.frameCount <= 1 || selectedZoneSettings.isSolid ? (
            <div className="mt-2 pt-2 border-t border-[#262626] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1">
                  <Paintbrush className="w-3 h-3 text-[#ff007f]" />
                  <span>SOLID FILL COLOR</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={selectedZoneSettings.solidColor || "#000000"}
                    onChange={(e) => handleChange("solidColor", e.target.value)}
                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                    title="Choose custom solid color"
                  />
                  <span className="font-mono text-[9px] text-stone-300 uppercase">
                    {selectedZoneSettings.solidColor || "#000000"}
                  </span>
                </div>
              </div>

              {/* Quick Swatches */}
              <div className="flex gap-1">
                {[
                  { label: "Black", color: "#000000" },
                  { label: "White", color: "#ffffff" },
                  { label: "Slate", color: "#1e293b" },
                  { label: "Pink", color: "#ff007f" },
                  { label: "Cyan", color: "#00f0ff" },
                  { label: "Emerald", color: "#10b981" },
                  { label: "Amber", color: "#f59e0b" },
                ].map((swatch) => (
                  <button
                    key={swatch.color}
                    type="button"
                    onClick={() => handleChange("solidColor", swatch.color)}
                    style={{ backgroundColor: swatch.color }}
                    className={`flex-1 h-5 rounded border transition-transform ${
                      (selectedZoneSettings.solidColor || "#000000").toLowerCase() === swatch.color.toLowerCase()
                        ? "border-[#00f0ff] ring-1 ring-[#00f0ff] scale-105"
                        : "border-[#333] hover:border-white"
                    }`}
                    title={swatch.label}
                  />
                ))}
              </div>

              <div className="p-2 bg-[#030712] border border-[#ff007f]/40 rounded text-[8.5px] font-mono text-stone-400 leading-normal">
                <span className="text-[#ff007f] font-bold block mb-0.5">✦ SOLID CURVE (0 FRAMES):</span>
                Multi-frame slicing removed. This curve renders as a static solid fill. Double-clicking on canvas to modify artwork is disabled for solid curves. Slide frame count (≥ 2) to re-enable animated artwork.
              </div>
            </div>
          ) : (
            /* Pitch Controls when Animated (frameCount >= 2) */
            <div className="mt-2 pt-2 border-t border-[#262626] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-widest">
                  WINDOW PHYSICAL PITCH
                </label>
                <span className="text-xs font-mono font-black text-[#00f0ff]">
                  {selectedZoneSettings.windowWidth.toFixed(2)} MM
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="window-width-slider"
                  type="range"
                  min="0.1"
                  max="8.0"
                  step="0.05"
                  value={selectedZoneSettings.windowWidth}
                  onChange={(e) => handleChange("windowWidth", parseFloat(e.target.value))}
                  className="flex-1 accent-[#00f0ff] bg-black h-1.5 rounded appearance-none cursor-pointer border border-[#262626]"
                />
                <input
                  id="window-width-input"
                  type="number"
                  min="0.1"
                  max="8.0"
                  step="0.05"
                  value={selectedZoneSettings.windowWidth}
                  onChange={(e) => {
                    const val = Math.max(0.1, Math.min(8.0, parseFloat(e.target.value) || 1.0));
                    handleChange("windowWidth", val);
                  }}
                  className="w-14 text-center text-xs bg-[#121212] border border-[#262626] rounded py-1 font-mono text-stone-200"
                />
              </div>

              {/* Quick Pitch Presets */}
              <div className="flex gap-1 pt-0.5">
                {[0.8, 1.0, 1.25, 1.5, 2.0].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleChange("windowWidth", preset)}
                    className={`flex-1 py-0.5 text-[8.5px] font-mono rounded cursor-pointer transition-colors ${
                      Math.abs(selectedZoneSettings.windowWidth - preset) < 0.01
                        ? "bg-[#00f0ff] text-black font-black"
                        : "bg-[#141a24] text-stone-400 hover:text-white border border-[#222]"
                    }`}
                  >
                    {preset}mm
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Vector direction Selector */}
        <VectorSelector
          value={selectedZoneSettings.revealDirection}
          onChange={(newVal) => handleChange("revealDirection", newVal)}
        />

        {/* LIVE WIREFRAME GRID & SLICING CALIBRATION SECTION */}
        <div className="p-3 bg-[#080c14] border border-[#00f0ff]/30 rounded flex flex-col gap-3 shadow-[0_0_15px_rgba(0,240,255,0.06)]">
          {/* Header with Live Preview Toggle Switch */}
          <div className="flex items-center justify-between border-b border-[#262626] pb-2">
            <div className="flex items-center gap-1.5 font-mono text-[10px] font-black text-[#00f0ff] tracking-widest">
              <Grid className="w-3.5 h-3.5 text-[#00f0ff]" />
              <span>LIVE WIREFRAME GRID</span>
            </div>

            {/* Live Toggle Switch */}
            <button
              onClick={() =>
                setIsSlicingPreviewActive && setIsSlicingPreviewActive(!isSlicingPreviewActive)
              }
              className={`p-1 px-2.5 rounded text-[9.5px] font-mono font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                isSlicingPreviewActive
                  ? "bg-[#00f0ff] text-black shadow-[0_0_10px_rgba(0,240,255,0.4)]"
                  : "bg-[#141a24] border border-[#262626] text-stone-500 hover:text-stone-300"
              }`}
              title="Toggle Live Slicing Wireframe Grid overlay directly on top of your original SVG source inside the main canvas"
            >
              {isSlicingPreviewActive ? <Eye className="w-3 h-3 text-black" /> : <EyeOff className="w-3 h-3 text-stone-500" />}
              <span>{isSlicingPreviewActive ? "GRID ACTIVE" : "MUTED"}</span>
            </button>
          </div>

          {/* Slicing Mode Pill Tabs: Wireframe vs Mask vs Dual */}
          <div className="grid grid-cols-3 gap-1 bg-black p-1 rounded border border-[#262626]">
            <button
              onClick={() => setSlicingMode && setSlicingMode("wireframe")}
              className={`py-1 text-center font-mono text-[9px] font-bold rounded uppercase tracking-wider transition-all cursor-pointer ${
                slicingMode === "wireframe" || slicingMode === "cutting"
                  ? "bg-[#00f0ff] text-black font-black shadow-[0_0_8px_rgba(0,240,255,0.3)]"
                  : "text-stone-400 hover:text-white"
              }`}
              title="Wireframe Grid: Shows laser/blade cut paths, phase stripes, and directional vector ray"
            >
              Wireframe
            </button>
            <button
              onClick={() => setSlicingMode && setSlicingMode("bars")}
              className={`py-1 text-center font-mono text-[9px] font-bold rounded uppercase tracking-wider transition-all cursor-pointer ${
                slicingMode === "bars"
                  ? "bg-[#00f0ff] text-black font-black shadow-[0_0_8px_rgba(0,240,255,0.3)]"
                  : "text-stone-400 hover:text-white"
              }`}
              title="Physical Mask: Shows black barrier occlusion bars simulating sliding physical sheet"
            >
              Mask
            </button>
            <button
              onClick={() => setSlicingMode && setSlicingMode("both")}
              className={`py-1 text-center font-mono text-[9px] font-bold rounded uppercase tracking-wider transition-all cursor-pointer ${
                slicingMode === "both"
                  ? "bg-[#ff007f] text-white font-black shadow-[0_0_8px_rgba(255,0,127,0.4)]"
                  : "text-stone-400 hover:text-white"
              }`}
              title="Dual View: Wireframe cut paths superimposed over barrier bars"
            >
              Dual View
            </button>
          </div>

          {/* Real-time Optical Geometry Specs Strip */}
          <div className="grid grid-cols-2 gap-1.5 text-[8.5px] font-mono bg-black/60 p-2 rounded border border-[#1f293d]">
            <div>
              <span className="text-stone-500 uppercase block">Slit Aperture:</span>
              <strong className="text-[#00f0ff]">{slitWidthMm} mm</strong>
            </div>
            <div>
              <span className="text-stone-500 uppercase block">Occlusion Duty:</span>
              <strong className="text-[#ff007f]">{dutyDark}% dark / {dutyClear}% clear</strong>
            </div>
          </div>

          {/* Live Phase Offset Slider & Animation */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono font-bold text-stone-400 uppercase tracking-widest">
                PHASE CALIBRATION
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={toggleAnimation}
                  className={`p-1 px-1.5 rounded text-[9px] font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-1 ${
                    isAnimating
                      ? "text-emerald-400 bg-emerald-500/20 border border-emerald-500/40 animate-pulse"
                      : "text-stone-400 hover:text-[#00f0ff] bg-black border border-[#262626]"
                  }`}
                  title={isAnimating ? "Pause alignment scan" : "Animate sliding parallax mask sheet"}
                >
                  <Play className={`w-2.5 h-2.5 ${isAnimating ? "rotate-90 text-emerald-400" : ""}`} />
                  <span>{isAnimating ? "STOP" : "ANIMATE"}</span>
                </button>
                <span className="text-[9px] font-mono text-stone-200 font-bold">
                  {(slicingPhase * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <input
              id="slicing-phase-slider"
              type="range"
              min="0.0"
              max="1.0"
              step="0.01"
              value={slicingPhase}
              onChange={(e) => setSlicingPhase && setSlicingPhase(parseFloat(e.target.value))}
              disabled={isAnimating}
              className="accent-[#00f0ff] bg-black border border-[#262626] h-1.5 rounded cursor-pointer opacity-90 hover:opacity-100 disabled:opacity-40"
            />
          </div>

          {/* Slicing Calibration Scale (px / mm) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono font-bold text-stone-400 uppercase tracking-widest">
                STAGE GRID RESOLUTION
              </span>
              <span className="text-[9px] font-mono text-stone-300 font-bold">
                {slicingScale.toFixed(1)} px/mm
              </span>
            </div>
            <input
              id="slicing-scale-slider"
              type="range"
              min="1.0"
              max="40.0"
              step="0.1"
              value={slicingScale}
              onChange={(e) => setSlicingScale && setSlicingScale(parseFloat(e.target.value))}
              className="accent-[#00f0ff] bg-black border border-[#262626] h-1.5 tracking-wider rounded cursor-pointer opacity-90 hover:opacity-100"
            />
          </div>

          {/* Vector Export Call-to-Action Buttons */}
          <div className="flex flex-col gap-2 mt-1">
            <button
              onClick={onExportSlices}
              className="w-full py-2 px-3 rounded bg-[#00f0ff] hover:bg-[#00c8d6] text-black font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>TRIM & EXPORT SLICES (.SVG)</span>
            </button>
            <button
              onClick={onExportCricutSlices}
              className="w-full py-2 px-3 rounded bg-black hover:bg-[#121212] border border-[#ff007f]/40 hover:border-[#ff007f] text-[#ff007f] font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95"
              title="Download vectors that can be directly cut inside Cricut Design Space (contains mathematically trimmed raw paths with no clipPaths)."
            >
              <Download className="w-3.5 h-3.5 text-[#ff007f]" />
              <span>CRICUT CUT-READY (.SVG)</span>
            </button>
          </div>
        </div>

        {/* Input: Notes / Metadata */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-mono font-bold text-stone-400 flex items-center gap-1 uppercase tracking-widest">
            <FileText className="w-3.5 h-3.5 text-stone-500" />
            <span>FABRICATION NOTES</span>
          </label>
          <textarea
            id="zone-notes"
            rows={4}
            value={selectedZoneSettings.notes}
            onChange={(e) => handleChange("notes", e.target.value)}
            className="w-full text-xs bg-[#121212] border border-[#262626] rounded px-2.5 py-2 text-stone-300 placeholder-stone-700 focus:outline-none focus:border-[#00f0ff]/50 resize-collapse h-24 font-mono leading-relaxed uppercase"
            placeholder="Assign speed profiles, depth variables or physical output parameters here..."
          />
        </div>
      </div>

      {/* Auto-save footer notice */}
      <div className="p-3 bg-black border-t border-[#262626] flex items-center justify-center gap-1.5 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[9px] font-mono text-stone-500 uppercase tracking-widest">
          CORE ENGINE SYNCHRONIZED
        </span>
      </div>
    </div>
  );
}
