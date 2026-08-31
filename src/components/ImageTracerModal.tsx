/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { X, Sliders, Image as ImageIcon, Sparkles, RefreshCw, ZoomIn, Eye, Check, Scissors, Layers } from "lucide-react";
import { traceImageContours } from "../imageTracer";
import { sanitizeSvg } from "../utils/svgSanitizer";

interface ImageTracerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVectorGenerated: (svgText: string, originalFileName: string) => void;
  showStatus: (text: string, type: "success" | "error" | "info") => void;
  initialImageFile?: File | null;
}

export function ImageTracerModal({
  isOpen,
  onClose,
  onVectorGenerated,
  showStatus,
  initialImageFile = null,
}: ImageTracerModalProps) {
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>("");
  const [threshold, setThreshold] = useState<number>(128);
  const [invert, setInvert] = useState<boolean>(false);
  const [smoothing, setSmoothing] = useState<number>(2.0);
  const [trimOverlaps, setTrimOverlaps] = useState<boolean>(true);
  const [minRegionPixels, setMinRegionPixels] = useState<number>(16);
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [curveCount, setCurveCount] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load initial image if passed in from parent drop/uploader
  useEffect(() => {
    if (isOpen && initialImageFile) {
      handleImageFile(initialImageFile);
    }
  }, [isOpen, initialImageFile]);

  // Re-run tracing when parameters adjust
  useEffect(() => {
    if (selectedImageSrc) {
      triggerTrace();
    }
  }, [selectedImageSrc, threshold, invert, smoothing, trimOverlaps, minRegionPixels]);

  if (!isOpen) return null;

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      showStatus("Invalid file pattern. Please select a valid raster image file.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImageSrc(e.target?.result as string);
      setImageFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  };

  // Convert the loaded image data on an offscreen canvas and run Moore Neighbor tracing
  const triggerTrace = () => {
    if (!selectedImageSrc) return;
    setIsProcessing(true);

    const img = new Image();
    img.src = selectedImageSrc;
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Restructure image bounds to limit resolution for optimal tracer speed (max width/height 320px)
      const maxDim = 320;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;

      // Clear list context
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      try {
        const svgResult = sanitizeSvg(
          traceImageContours(canvas, threshold, invert, smoothing, trimOverlaps, minRegionPixels),
        );
        setPreviewSvg(svgResult);
        
        // Count extracted paths
        const matches = svgResult.match(/<path/g);
        setCurveCount(matches ? matches.length : 0);
      } catch (err: any) {
        console.error("Vector tracing failure:", err);
      } finally {
        setIsProcessing(false);
      }
    };
  };

  const handleApplyVector = () => {
    if (!previewSvg) return;
    const baseName = imageFileName.replace(/\.[^/.]+$/, "");
    onVectorGenerated(previewSvg, `${baseName}-traced.svg`);
    showStatus(`Extracted ${curveCount} clean non-overlapping closed curves successfully!`, "success");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-[#000000]/95 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-[#0c0c0c] border border-[#262626] rounded-none w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header bar */}
        <div className="p-4 border-b border-[#262626] flex items-center justify-between bg-black">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-[#00f0ff]" />
            <h3 className="text-xs font-bold font-mono tracking-widest text-stone-100 uppercase">
              [INTHE] COGNITIVE RASTER VECTORIZER
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#262626] text-stone-400 hover:text-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-0 min-h-0">
          
          {/* Controls parameters panel (Left column) */}
          <div className="md:col-span-4 p-5 bg-[#0a0a0a] border-r border-[#262626] flex flex-col gap-5">
            <div>
              <h4 className="text-[10px] font-bold font-mono text-[#00f0ff] tracking-widest uppercase mb-1">
                01 / UPLOAD RASTER
              </h4>
              <p className="text-[10px] text-stone-500 font-mono uppercase leading-relaxed mb-3">
                Silhouette stencils or high-contrast curves for optimal contour mapping.
              </p>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 px-4 rounded bg-[#121212] hover:bg-[#202020] border border-[#262626] text-stone-200 text-[10px] font-bold font-mono uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-[#ff007f]" />
                <span>{selectedImageSrc ? "REPLACE COGNITIVE FILE" : "SELECT RASTER FILE"}</span>
              </button>
            </div>

            {selectedImageSrc && (
              <div className="flex flex-col gap-5 border-t border-[#262626] pt-4">
                <h4 className="text-[10px] font-bold font-mono text-[#ff007f] tracking-widest uppercase">
                  02 / TRACER CALIBRATION
                </h4>

                {/* Slider: Lightness Threshold */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                    <span className="text-stone-400 uppercase">LIGHTNESS CRITERIA</span>
                    <span className="text-[#ff007f] font-black">{threshold}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="245"
                    step="2"
                    value={threshold}
                    onChange={(e) => setThreshold(parseInt(e.target.value))}
                    className="w-full accent-[#ff007f] h-1 bg-black border border-[#262626] rounded appearance-none cursor-pointer"
                  />
                  <span className="text-[8.5px] text-stone-500 font-mono uppercase">
                    Refine bounds targeting vector density peaks.
                  </span>
                </div>

                {/* Slider: Curve Decimation / Smoothing */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                    <span className="text-stone-400 uppercase">CURVE SMOOTHING</span>
                    <span className="text-[#00f0ff] font-black">{smoothing.toFixed(1)} PX</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="8.0"
                    step="0.5"
                    value={smoothing}
                    onChange={(e) => setSmoothing(parseFloat(e.target.value))}
                    className="w-full accent-[#00f0ff] h-1 bg-black border border-[#262626] rounded appearance-none cursor-pointer"
                  />
                  <span className="text-[8.5px] text-stone-500 font-mono uppercase">
                    Eradicates stray vertex jitter for cleaner slotting.
                  </span>
                </div>

                {/* Checkbox: Invert Selection */}
                <label className="flex items-center gap-2.5 cursor-pointer select-none py-1">
                  <input
                    type="checkbox"
                    checked={invert}
                    onChange={(e) => setInvert(e.target.checked)}
                    className="rounded border-[#262626] text-[#00f0ff] focus:ring-[#00f0ff] bg-black w-4 h-4 accent-[#00f0ff]"
                  />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono font-bold text-stone-300 uppercase">INVERT SOURCE FIELDS</span>
                    <span className="text-[9px] font-mono text-stone-500 uppercase">Trace white instead of black pixels</span>
                  </div>
                </label>

                {/* Overlap Trimming & De-nesting Switch */}
                <div className="border-t border-[#262626] pt-3 flex flex-col gap-3">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none py-1">
                    <input
                      type="checkbox"
                      checked={trimOverlaps}
                      onChange={(e) => setTrimOverlaps(e.target.checked)}
                      className="rounded border-[#262626] text-[#ff007f] focus:ring-[#ff007f] bg-black w-4 h-4 accent-[#ff007f]"
                    />
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <Scissors className="w-3 h-3 text-[#ff007f]" />
                        <span className="text-[10px] font-mono font-bold text-[#ff007f] uppercase">
                          TRIM OVERLAPPING CURVES
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-stone-500 uppercase">
                        Trims nested & overlapping paths so no curves sit on top of each other
                      </span>
                    </div>
                  </label>

                  {/* Slider: Min Region Size / Speckle Filter */}
                  {trimOverlaps && (
                    <div className="flex flex-col gap-1.5 pl-6">
                      <div className="flex items-center justify-between text-[9px] font-mono font-bold">
                        <span className="text-stone-400 uppercase">MIN REGION AREA</span>
                        <span className="text-[#ff007f] font-black">{minRegionPixels} PX</span>
                      </div>
                      <input
                        type="range"
                        min="4"
                        max="120"
                        step="4"
                        value={minRegionPixels}
                        onChange={(e) => setMinRegionPixels(parseInt(e.target.value))}
                        className="w-full accent-[#ff007f] h-1 bg-black border border-[#262626] rounded appearance-none cursor-pointer"
                      />
                      <span className="text-[8px] text-stone-500 font-mono uppercase">
                        Filters micro-speckle noise so only clean closed shapes are extracted.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Canvas comparison previewer space (Right column) */}
          <div className="md:col-span-8 p-6 flex flex-col min-h-[360px] bg-black">
            {selectedImageSrc ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 bg-[#0c0c0c] p-4 rounded border border-[#262626]">
                  
                  {/* Left panel: Original raster source */}
                  <div className="flex flex-col items-center justify-center p-2 border border-[#262626] bg-[#060606] rounded relative overflow-hidden">
                    <span className="absolute top-2 left-2 text-[8px] font-mono bg-black border border-[#262626] text-stone-400 px-2 py-0.5 rounded uppercase font-bold tracking-widest z-10">
                      ORIGINAL PHASES
                    </span>
                    <img
                      src={selectedImageSrc}
                      alt="Source artwork preview"
                      className="max-h-[30vh] max-w-full object-contain filter drop-shadow opacity-70"
                    />
                  </div>

                  {/* Right panel: Traced vector overlay */}
                  <div className="flex flex-col items-center justify-center p-2 border border-[#00f0ff]/35 bg-[#060606] rounded relative overflow-hidden">
                    <span className="absolute top-2 left-2 text-[8px] font-mono bg-black border border-[#00f0ff]/40 text-[#00f0ff] px-2 py-0.5 rounded uppercase font-bold tracking-widest z-10 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-[#00f0ff] animate-pulse" />
                      <span>TRACED PATH OUTLINES</span>
                    </span>
                    {previewSvg ? (
                      <div
                        className="w-full h-full max-h-[30vh] max-w-full flex items-center justify-center filter hue-rotate-15"
                        dangerouslySetInnerHTML={{ __html: previewSvg }}
                      />
                    ) : (
                      <div className="text-[10px] text-stone-500 animate-pulse font-mono uppercase tracking-widest">
                        DECIPHERING COGNITIVE MATRIX...
                      </div>
                    )}
                  </div>
                </div>

                {/* Traced Statistics / Warnings */}
                <div className="mt-4 p-3.5 bg-[#0c0c0c] border border-[#262626] rounded flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                    <p className="text-[9.5px] text-stone-300 font-mono uppercase leading-relaxed flex items-center gap-2">
                      <span>{curveCount} closed curves extracted.</span>
                      {trimOverlaps && (
                        <span className="text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[8.5px]">
                          ✓ NO OVERLAPPING CURVES
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-[9px] font-mono text-stone-500 bg-black border border-[#262626] px-2 py-1 rounded">
                    320PX SCALED
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded bg-[#0c0c0c] border border-[#262626] flex items-center justify-center mb-4">
                  <ImageIcon className="w-6 h-6 text-stone-700" />
                </div>
                <h4 className="text-[11px] font-bold min-h-2 font-mono uppercase tracking-widest text-stone-300">NO COGNITIVE LAYER ACCESSED</h4>
                <p className="text-stone-500 text-[10px] font-mono max-w-sm mt-1 uppercase leading-relaxed p-1">
                  Upload a sketch stencil silhouette or high contrast raster pattern to populate the vector slicing grid.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-black border-t border-[#262626] flex items-center justify-between shrink-0">
          <p className="text-[9px] text-stone-600 font-mono uppercase tracking-widest">
            THREAD RECTIFICATION SECURE / NO SERVER OVERHEAD
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="py-1.5 px-4 rounded bg-black hover:bg-[#121212] border border-[#262626] hover:border-stone-700 text-stone-400 text-[10px] font-black font-mono uppercase tracking-widest cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={!previewSvg}
              onClick={handleApplyVector}
              className={`py-1.5 px-5 rounded text-black font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5 transition-all ${
                previewSvg
                  ? "bg-[#00f0ff] hover:bg-[#00c8d6] cursor-pointer shadow-lg active:scale-95"
                  : "bg-stone-900 border border-[#262626] text-stone-600 cursor-not-allowed"
              }`}
            >
              <Check className="w-4 h-4" />
              <span>COMMIT SVG PATHS</span>
            </button>
          </div>
        </div>

        {/* Hidden offscreen canvas for rendering source image pixels */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
