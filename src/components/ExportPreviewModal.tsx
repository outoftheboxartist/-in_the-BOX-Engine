/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Scissors,
  Download,
  Eye,
  EyeOff,
  Layers,
  Play,
  Pause,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Film,
  ZoomIn,
  ZoomOut,
  Maximize2,
  CheckCircle2,
  Image as ImageIcon,
  FileCode,
  Grid,
} from "lucide-react";
import { ZoneSettings, SVGZoneInfo, ZoneArtwork } from "../types";
import {
  generateCricutClosedCurveSvg,
  renderHighResTransparentPng,
  downloadExportFile,
} from "../utils/cricutExportEngine";

interface ExportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedZoneId: string | null;
  zoneSettings: Record<string, ZoneSettings>;
  projectName: string;
  slicingScale: number;
  slicingPhase: number;
  slicingMode: "cutting" | "bars" | "wireframe" | "both";
  zones: SVGZoneInfo[];
  zoneArtworks?: Record<string, ZoneArtwork>;
  svgContent?: string | null;
  onSelectZone: (zoneId: string | null) => void;
  onOpenArtworkStudio?: () => void;
  onOpenStitchedPreview?: () => void;
  showStatus?: (msg: string, type?: "success" | "error" | "info") => void;
}

export function ExportPreviewModal({
  isOpen,
  onClose,
  selectedZoneId,
  zoneSettings,
  projectName,
  slicingScale,
  slicingPhase,
  slicingMode,
  zones = [],
  zoneArtworks = {},
  svgContent = null,
  onSelectZone,
  showStatus,
}: ExportPreviewModalProps) {
  // Export Configuration State
  const [exportResolution, setExportResolution] = useState<number>(3600); // 3600px = 300 DPI for 12"x12"
  const [activeZoneFilter, setActiveZoneFilter] = useState<string>("all");
  const [previewMode, setPreviewMode] = useState<"png_transparent" | "vector_svg" | "grating_mask">("png_transparent");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgressText, setExportProgressText] = useState<string>("");

  // Animation Stepping State
  const [currentFrame, setCurrentFrame] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Zoom & Pan for Preview Canvas
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Preview data URL
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  const activeZones = zones.filter((z) => {
    const s = zoneSettings[z.id];
    const name = s?.zoneName || z.defaultName;
    return name !== "Rect #1" && z.defaultName !== "Rect #1";
  });

  const maxFrameCount = Math.max(
    ...activeZones.map((z) => zoneSettings[z.id]?.frameCount || 6),
    activeZones.length > 0 ? 2 : 6
  );

  // Auto-play animation cycle
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setCurrentFrame((prev) => (prev >= maxFrameCount ? 1 : prev + 1));
      }, 400);
    } else if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, maxFrameCount]);

  // Generate live preview when settings change
  useEffect(() => {
    if (!isOpen || !svgContent) return;

    let isMounted = true;
    const generatePreview = async () => {
      try {
        const phaseOffset = (currentFrame - 1) / maxFrameCount;
        const targetZoneId = activeZoneFilter === "all" ? undefined : activeZoneFilter;

        const dataUrl = await renderHighResTransparentPng(
          svgContent,
          zones,
          zoneSettings,
          zoneArtworks,
          {
            width: 1200, // Lightweight responsive size for live modal preview
            type: previewMode === "grating_mask" ? "grating" : "composite",
            targetZoneId,
            frameIndex: currentFrame - 1,
            phase: phaseOffset,
            slicingScale,
          }
        );

        if (isMounted) {
          setPreviewDataUrl(dataUrl);
        }
      } catch (err) {
        console.warn("Preview generation error:", err);
      }
    };

    generatePreview();
    return () => {
      isMounted = false;
    };
  }, [
    isOpen,
    svgContent,
    activeZoneFilter,
    previewMode,
    currentFrame,
    maxFrameCount,
    slicingScale,
    zones,
    zoneSettings,
    zoneArtworks,
  ]);

  if (!isOpen) return null;

  // ViewBox string helper
  const getViewBox = () => {
    if (svgContent) {
      const match = svgContent.match(/viewBox=["']([^"']+)["']/i);
      if (match) return match[1];
    }
    return "0 0 500 500";
  };

  // 1. Export High-Res Black & Transparent PNG for Cricut
  const handleExportHighResPng = async (type: "composite" | "grating") => {
    if (!svgContent) return;
    setIsExporting(true);
    setExportProgressText("Rasterizing 300 DPI high-precision Black & Transparent PNG...");

    try {
      const targetZoneId = activeZoneFilter === "all" ? undefined : activeZoneFilter;
      const cleanName = (projectName || "scanimation").toLowerCase().replace(/[^a-z0-9_]+/g, "-");
      const filename =
        type === "grating"
          ? `${cleanName}-optical-grating-300dpi.png`
          : `${cleanName}-interlaced-artwork-300dpi.png`;

      const dataUrl = await renderHighResTransparentPng(
        svgContent,
        zones,
        zoneSettings,
        zoneArtworks,
        {
          width: exportResolution,
          type,
          targetZoneId,
          frameIndex: currentFrame - 1,
          phase: (currentFrame - 1) / maxFrameCount,
          slicingScale,
        }
      );

      downloadExportFile(dataUrl, filename, "image/png");
      showStatus?.(
        `✓ Exported high-precision ${type === "grating" ? "Grating Mask" : "Interlaced Artwork"} PNG (${exportResolution}px, Transparent)!`,
        "success"
      );
    } catch (err: any) {
      showStatus?.(`Export failed: ${err.message}`, "error");
    } finally {
      setIsExporting(false);
      setExportProgressText("");
    }
  };

  // 2. Export Multi-Frame Animation Sequence PNGs
  const handleExportFrameSequence = async () => {
    if (!svgContent) return;
    setIsExporting(true);

    try {
      const cleanName = (projectName || "scanimation").toLowerCase().replace(/[^a-z0-9_]+/g, "-");
      const targetZoneId = activeZoneFilter === "all" ? undefined : activeZoneFilter;

      for (let f = 0; f < maxFrameCount; f++) {
        setExportProgressText(`Exporting Frame ${f + 1} of ${maxFrameCount} (Black & Transparent PNG)...`);
        const phaseOffset = f / maxFrameCount;

        const dataUrl = await renderHighResTransparentPng(
          svgContent,
          zones,
          zoneSettings,
          zoneArtworks,
          {
            width: exportResolution,
            type: "single_zone",
            targetZoneId,
            frameIndex: f,
            phase: phaseOffset,
            slicingScale,
          }
        );

        const filename = `${cleanName}-frame-${f + 1}-of-${maxFrameCount}.png`;
        downloadExportFile(dataUrl, filename, "image/png");
        await new Promise((r) => setTimeout(r, 150)); // Brief stagger for browser download queue
      }

      showStatus?.(`✓ Successfully downloaded all ${maxFrameCount} animation frames as transparent PNGs!`, "success");
    } catch (err: any) {
      showStatus?.(`Sequence export error: ${err.message}`, "error");
    } finally {
      setIsExporting(false);
      setExportProgressText("");
    }
  };

  // 3. Export True Closed-Curve Cricut SVG Vector
  const handleExportClosedCurveSvg = () => {
    try {
      const targetZoneId = activeZoneFilter === "all" ? null : activeZoneFilter;
      const cleanName = (projectName || "scanimation").toLowerCase().replace(/[^a-z0-9_]+/g, "-");
      const filename = `${cleanName}-cricut-closed-curves.svg`;

      const svgString = generateCricutClosedCurveSvg(
        getViewBox(),
        zones,
        zoneSettings,
        targetZoneId,
        slicingScale,
        (currentFrame - 1) / maxFrameCount,
        slicingMode
      );

      downloadExportFile(svgString, filename, "image/svg+xml;charset=utf-8");
      showStatus?.("✓ Clean closed-curve Cricut SVG exported with genuine closed cut paths!", "success");
    } catch (err: any) {
      showStatus?.(`SVG export error: ${err.message}`, "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 font-mono select-none">
      <div className="bg-[#0b0e14] border border-[#262626] rounded-xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden text-stone-200">
        {/* Header Bar */}
        <div className="px-6 py-4 bg-[#111622] border-b border-[#262626] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#ff007f]/10 border border-[#ff007f]/40 flex items-center justify-center text-[#ff007f]">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wider uppercase">
                  HIGH-PRECISION CRICUT & CUTTING EXPORT
                </h2>
                <span className="px-2 py-0.5 rounded bg-[#00f0ff]/10 text-[#00f0ff] border border-[#00f0ff]/30 text-[10px] font-bold">
                  300 DPI Transparent PNG + Closed-Path SVG
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Solid Black markings (#000000) on pure Transparent backgrounds. No trimming or background cleanup required.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-[#1a2130] text-stone-400 hover:text-white hover:bg-[#263147] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Content Layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left Canvas Preview Area (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col bg-[#07090e] border-r border-[#262626] relative overflow-hidden">
            {/* Viewport Toolbar */}
            <div className="p-3 bg-[#0d121c] border-b border-[#262626] flex items-center justify-between text-xs">
              {/* Preview Mode Selector */}
              <div className="flex items-center gap-1 bg-[#151d2d] p-1 rounded border border-[#262626]">
                <button
                  type="button"
                  onClick={() => setPreviewMode("png_transparent")}
                  className={`px-3 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    previewMode === "png_transparent"
                      ? "bg-[#00f0ff] text-black"
                      : "text-stone-400 hover:text-white"
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Interlaced Sheet</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("grating_mask")}
                  className={`px-3 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    previewMode === "grating_mask"
                      ? "bg-[#ff007f] text-white"
                      : "text-stone-400 hover:text-white"
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" />
                  <span>Optical Grating</span>
                </button>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-[#151d2d] p-1 rounded border border-[#262626]">
                <button
                  onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
                  className="p-1 text-stone-400 hover:text-white transition-colors cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 text-[10px] text-stone-300 font-bold min-w-12 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(4, z + 0.2))}
                  className="p-1 text-stone-400 hover:text-white transition-colors cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="p-1 text-stone-400 hover:text-white transition-colors cursor-pointer"
                  title="Reset View"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Interactive Checkerboard Canvas Area */}
            <div
              className="flex-1 overflow-hidden relative flex items-center justify-center cursor-grab active:cursor-grabbing bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]"
              onMouseDown={(e) => {
                setIsPanning(true);
                setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
              }}
              onMouseMove={(e) => {
                if (isPanning) {
                  setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
                }
              }}
              onMouseUp={() => setIsPanning(false)}
              onMouseLeave={() => setIsPanning(false)}
            >
              {/* Checkerboard Pattern for Visual Transparency Confirmation */}
              <div
                className="relative shadow-2xl border border-[#334155]/40 rounded bg-[repeating-conic-gradient(#1a202c_0%_25%,#111622_0%_50%)] [background-size:24px_24px] max-w-[85%] max-h-[85%] transition-transform duration-75 flex items-center justify-center"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "center center",
                }}
              >
                {previewDataUrl ? (
                  <img
                    src={previewDataUrl}
                    alt="Export Cut Preview"
                    className="max-h-[500px] w-auto object-contain pointer-events-none"
                  />
                ) : (
                  <div className="w-80 h-80 flex items-center justify-center text-stone-500 text-xs">
                    Generating high-resolution preview...
                  </div>
                )}
              </div>

              {/* Watermark Label */}
              <div className="absolute bottom-3 left-3 bg-black/80 px-2.5 py-1 rounded border border-[#262626] text-[10px] text-stone-400 flex items-center gap-1.5 pointer-events-none">
                <span className="w-2 h-2 rounded-full bg-[#00f0ff] animate-pulse" />
                <span>Checkerboard indicates 100% Alpha Transparency</span>
              </div>
            </div>

            {/* Animation Phase Stepper Footer */}
            <div className="p-3 bg-[#0d121c] border-t border-[#262626] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`px-3 py-1.5 rounded font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    isPlaying ? "bg-[#ff007f] text-white" : "bg-[#1f293d] text-[#00f0ff] hover:bg-[#2b3954]"
                  }`}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlaying ? "Pause Loop" : "Test Motion"}</span>
                </button>

                <div className="flex items-center gap-1 bg-[#151d2d] px-2 py-1 rounded border border-[#262626]">
                  <button
                    onClick={() => setCurrentFrame((f) => (f <= 1 ? maxFrameCount : f - 1))}
                    className="p-0.5 text-stone-400 hover:text-white cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] font-bold text-white px-2">
                    Phase {currentFrame} / {maxFrameCount}
                  </span>
                  <button
                    onClick={() => setCurrentFrame((f) => (f >= maxFrameCount ? 1 : f + 1))}
                    className="p-0.5 text-stone-400 hover:text-white cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-stone-400">
                Phase Offset: <span className="text-[#00f0ff] font-bold">{(((currentFrame - 1) / maxFrameCount) * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>

          {/* Right Export Action Center (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col bg-[#0b0e14] p-5 overflow-y-auto space-y-5">
            {/* Target Layer Filter */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#00f0ff]" />
                <span>Select Target Shapes / Zone</span>
              </label>
              <select
                value={activeZoneFilter}
                onChange={(e) => setActiveZoneFilter(e.target.value)}
                className="w-full bg-[#111622] border border-[#262626] rounded px-3 py-2 text-xs text-white focus:border-[#00f0ff] outline-none"
              >
                <option value="all">Entire Workbook (All Sliced Zones Combined)</option>
                {activeZones.map((z) => {
                  const s = zoneSettings[z.id];
                  return (
                    <option key={z.id} value={z.id}>
                      {s?.zoneName || z.defaultName} ({s?.frameCount || 6} frames, {s?.revealDirection.angle}° angle)
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Precision Resolution Picker */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#ff007f]" />
                <span>PNG Precision & Canvas Resolution</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "4K (300 DPI)", size: 3600, desc: "Cricut & Laser" },
                  { label: "2K Crisp", size: 2048, desc: "Fine Print" },
                  { label: "1K Fast", size: 1024, desc: "Draft" },
                ].map((item) => (
                  <button
                    key={item.size}
                    type="button"
                    onClick={() => setExportResolution(item.size)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      exportResolution === item.size
                        ? "bg-[#00f0ff]/10 border-[#00f0ff] text-[#00f0ff]"
                        : "bg-[#111622] border-[#262626] text-stone-400 hover:border-stone-500"
                    }`}
                  >
                    <div className="text-xs font-bold text-white">{item.label}</div>
                    <div className="text-[9px] text-stone-400">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Main Action Buttons */}
            <div className="space-y-3 pt-2">
              <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                1-Click Cricut & Cutter Exports
              </div>

              {/* 1. Interlaced Artwork PNG */}
              <button
                type="button"
                disabled={isExporting}
                onClick={() => handleExportHighResPng("composite")}
                className="w-full p-3.5 bg-gradient-to-r from-[#00f0ff]/20 to-[#00f0ff]/5 hover:from-[#00f0ff]/30 hover:to-[#00f0ff]/10 border border-[#00f0ff] text-white rounded-lg flex items-center justify-between cursor-pointer transition-all shadow-[0_0_15px_rgba(0,240,255,0.15)] disabled:opacity-50"
              >
                <div className="flex items-center gap-3 text-left">
                  <div className="w-8 h-8 rounded bg-[#00f0ff] text-black flex items-center justify-center font-bold">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">INTERLACED ARTWORK PNG</div>
                    <div className="text-[10px] text-[#00f0ff]">Solid Black on Transparent • 300 DPI</div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-[#00f0ff]" />
              </button>

              {/* 2. Optical Grating Slit Barrier PNG */}
              <button
                type="button"
                disabled={isExporting}
                onClick={() => handleExportHighResPng("grating")}
                className="w-full p-3.5 bg-gradient-to-r from-[#ff007f]/20 to-[#ff007f]/5 hover:from-[#ff007f]/30 hover:to-[#ff007f]/10 border border-[#ff007f] text-white rounded-lg flex items-center justify-between cursor-pointer transition-all shadow-[0_0_15px_rgba(255,0,127,0.15)] disabled:opacity-50"
              >
                <div className="flex items-center gap-3 text-left">
                  <div className="w-8 h-8 rounded bg-[#ff007f] text-white flex items-center justify-center font-bold">
                    <Grid className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">OPTICAL GRATING MASK PNG</div>
                    <div className="text-[10px] text-[#ff007f]">Physical Bar Overlay • Black & Transparent</div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-[#ff007f]" />
              </button>

              {/* 3. True Closed-Curve SVG Vector */}
              <button
                type="button"
                disabled={isExporting}
                onClick={handleExportClosedCurveSvg}
                className="w-full p-3.5 bg-[#141b27] hover:bg-[#1a2333] border border-[#2a374f] text-white rounded-lg flex items-center justify-between cursor-pointer transition-all disabled:opacity-50"
              >
                <div className="flex items-center gap-3 text-left">
                  <div className="w-8 h-8 rounded bg-[#2a374f] text-stone-200 flex items-center justify-center font-bold">
                    <FileCode className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">CLOSED-CURVE CRICUT SVG</div>
                    <div className="text-[10px] text-stone-400">Genuine Closed Polygons (M...Z) for Blade Cutters</div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-stone-300" />
              </button>

              {/* 4. Multi-Frame Animation Sequence PNGs */}
              <button
                type="button"
                disabled={isExporting}
                onClick={handleExportFrameSequence}
                className="w-full p-3 bg-[#111622] hover:bg-[#161c2b] border border-[#262626] text-stone-300 rounded-lg flex items-center justify-between cursor-pointer transition-all disabled:opacity-50 text-xs"
              >
                <div className="flex items-center gap-2.5 text-left">
                  <Film className="w-4 h-4 text-amber-400" />
                  <div>
                    <span className="font-bold text-white">Export All {maxFrameCount} Transparent Frames</span>
                    <div className="text-[9px] text-stone-400">Download each stop-motion frame sequence</div>
                  </div>
                </div>
                <Download className="w-3.5 h-3.5 text-stone-400" />
              </button>
            </div>

            {/* Status Progress Indicator */}
            {isExporting && (
              <div className="p-3 bg-[#151d2d] border border-[#00f0ff]/40 rounded text-center space-y-1.5 animate-pulse">
                <div className="text-xs text-[#00f0ff] font-bold flex items-center justify-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00f0ff] animate-ping" />
                  <span>{exportProgressText || "Exporting files..."}</span>
                </div>
              </div>
            )}

            {/* Help & Cricut Tip Card */}
            <div className="p-3.5 bg-[#0e131d] border border-[#1e293b] rounded-lg text-[11px] text-stone-400 space-y-1.5 leading-relaxed">
              <div className="font-bold text-stone-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#00f0ff]" />
                <span>Cricut Design Space Tips:</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[10px]">
                <li>
                  <strong>High-Res PNG</strong>: Upload image into Design Space $\to$ Select <em>"Cut Image"</em>. Transparent background auto-selects all contours instantly.
                </li>
                <li>
                  <strong>Closed-Curve SVG</strong>: Upload SVG $\to$ Select <em>"Basic Cut"</em> $\to$ Click <em>"Attach"</em> on mat to hold positions together.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
