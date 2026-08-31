/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { X, Sliders, Image as ImageIcon, Sparkles, RefreshCw, Pipette, Check, Plus, Layers, Info, Undo2 } from "lucide-react";
import { traceClickedColorIsland, getClosestColorName } from "../imageTracer";

interface SessionTrace {
  id: string;
  zoneId: string;
  colorName: string;
  colorHex: string;
  pathD: string;
  pathCount: number;
  islandPixelIndices: number[];
}

interface ColorPickerTracerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTracedPath: (pathD: string, colorHex: string, colorName: string) => string;
  onUpdateTracedPath: (zoneId: string, updatedName: string, updatedColorHex: string) => void;
  onRemoveTracedPath: (zoneId: string) => void;
  showStatus: (text: string, type: "success" | "error" | "info") => void;
}

export function ColorPickerTracerModal({
  isOpen,
  onClose,
  onAddTracedPath,
  onUpdateTracedPath,
  onRemoveTracedPath,
  showStatus,
}: ColorPickerTracerModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>("");
  const [tolerance, setTolerance] = useState<number>(25);
  const [smoothing, setSmoothing] = useState<number>(1.0);
  
  // Real-time hover color info
  const [hoverColor, setHoverColor] = useState<{ r: number; g: number; b: number; hex: string } | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  
  // List of paths traced during this session
  const [sessionTraces, setSessionTraces] = useState<SessionTrace[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  // Global pixel mask of size width * height (1 = previously traced/claimed, 0 = free)
  const [globalMask, setGlobalMask] = useState<Uint8Array | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 400, height: 400 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load a colorful preset image automatically if no image is uploaded
  const PRESET_IMAGE_URL = "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=600&q=80"; // Bright abstract paint

  useEffect(() => {
    if (isOpen) {
      // Clear session when opened
      setSessionTraces([]);
      setSelectedTraceId(null);
      setGlobalMask(null);
      // Start with the default template preset if they want to try it out
      setImageSrc(PRESET_IMAGE_URL);
      setImageFileName("colorful-swirl-preset.jpg");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      showStatus("Invalid file pattern. Please select a valid raster image file.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setImageSrc(e.target?.result as string);
      setImageFileName(file.name);
      setSessionTraces([]);
      setSelectedTraceId(null);
      setGlobalMask(null);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  };

  const rgbToHex = (r: number, g: number, b: number): string => {
    return "#" + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    }).join("").toUpperCase();
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const rect = img.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);

    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
      setHoverColor(null);
      setHoverPos(null);
      return;
    }

    // Check if hovered coordinate is already masked out
    if (globalMask && globalMask[x + y * canvas.width] === 1) {
      setHoverColor(null);
      setHoverPos(null);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      if (pixel[3] < 20) {
        // Transparent pixel
        setHoverColor(null);
        setHoverPos(null);
        return;
      }
      const r = pixel[0];
      const g = pixel[1];
      const b = pixel[2];
      const hex = rgbToHex(r, g, b);
      setHoverColor({ r, g, b, hex });
      setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    } catch (err) {
      // Cross-origin image safety fallback
      setHoverColor(null);
      setHoverPos(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverColor(null);
    setHoverPos(null);
  };

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !globalMask) return;

    const rect = img.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);

    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;

    // Check if clicked pixel is already masked out/captured
    const clickIdx = x + y * canvas.width;
    if (globalMask[clickIdx] === 1) {
      showStatus("This region is already captured and masked out.", "info");
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      if (pixel[3] < 10) {
        showStatus("Clicked on transparent space. Choose a colored pixel region instead.", "info");
        return;
      }

      const r = pixel[0];
      const g = pixel[1];
      const b = pixel[2];

      // Perform single island trace instead of entire image color regions
      const result = traceClickedColorIsland(
        canvas,
        x,
        y,
        { r, g, b },
        tolerance,
        globalMask,
        smoothing
      );

      if (!result) {
        showStatus(`No solid island boundaries found matching this color region. Try increasing variance.`, "info");
        return;
      }

      // Add to main App State zones, which returns the zoneId
      const zoneId = onAddTracedPath(result.pathD, result.colorHex, result.colorName);

      if (!zoneId) return;

      // Add to local session checklist
      const traceId = `trace-${Date.now()}`;
      const newTrace: SessionTrace = {
        id: traceId,
        zoneId: zoneId,
        colorName: `${result.colorName} Region`,
        colorHex: result.colorHex,
        pathD: result.pathD,
        pathCount: result.pathD.split("M").length - 1,
        islandPixelIndices: result.islandPixelIndices,
      };

      setSessionTraces((prev) => [...prev, newTrace]);
      setSelectedTraceId(traceId);

      // Permanently mask out the pixels in this island so they cannot be clicked/re-traced
      const updatedMask = new Uint8Array(globalMask);
      for (const idx of result.islandPixelIndices) {
        updatedMask[idx] = 1;
      }
      setGlobalMask(updatedMask);

    } catch (err: any) {
      showStatus("Cross-origin or canvas safety block. Try importing a local file.", "error");
    }
  };

  const handleBack = () => {
    if (sessionTraces.length === 0) {
      showStatus("No traced islands left to undo.", "info");
      return;
    }

    const lastTrace = sessionTraces[sessionTraces.length - 1];
    
    // 1. Tell parent App.tsx to remove this path from workspace/live preview
    onRemoveTracedPath(lastTrace.zoneId);

    // 2. Unmask pixels in globalMask so they can be clicked/traced again
    if (globalMask) {
      const updatedMask = new Uint8Array(globalMask);
      for (const idx of lastTrace.islandPixelIndices) {
        updatedMask[idx] = 0;
      }
      setGlobalMask(updatedMask);
    }

    // 3. Update sessionTraces state
    const updatedTraces = sessionTraces.slice(0, -1);
    setSessionTraces(updatedTraces);

    // 4. Update selection
    if (updatedTraces.length > 0) {
      setSelectedTraceId(updatedTraces[updatedTraces.length - 1].id);
    } else {
      setSelectedTraceId(null);
    }
  };

  // Draw loaded image on an offscreen canvas to allow pixel queries
  const syncImageToCanvas = () => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const maxDim = 400; // Limit processing scale for optimal speed
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    
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
    setCanvasSize({ width: w, height: h });
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // Initialize clean mask of size w * h
    const initMask = new Uint8Array(w * h);
    setGlobalMask(initMask);
  };

  // Find currently selected island from session list to support live edits
  const activeTrace = sessionTraces.find(t => t.id === selectedTraceId);

  return (
    <div className="fixed inset-0 bg-[#000000]/95 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-[#0c0c0c] border border-[#262626] rounded-none w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Header bar */}
        <div className="p-4 border-b border-[#262626] flex items-center justify-between bg-black">
          <div className="flex items-center gap-2">
            <Pipette className="w-5 h-5 text-[#ff007f]" />
            <h3 className="text-xs font-bold font-mono tracking-widest text-stone-100 uppercase">
              [INTHE] COLOR MAGIC-WAND VECTORIZER
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
                01 / TARGET IMAGE
              </h4>
              <p className="text-[10px] text-stone-500 font-mono uppercase leading-relaxed mb-3">
                Load any multicolor logo, pattern, or illustration, then click coordinates to capture shapes.
              </p>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="py-2 px-3 rounded bg-[#121212] hover:bg-[#202020] border border-[#262626] text-stone-200 text-[10px] font-bold font-mono uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-[#ff007f]" />
                  <span>BROWSE FILE</span>
                </button>
                
                <button
                  onClick={() => {
                    setImageSrc(PRESET_IMAGE_URL);
                    setImageFileName("colorful-swirl-preset.jpg");
                    setSessionTraces([]);
                    setSelectedTraceId(null);
                    setGlobalMask(null);
                  }}
                  className="py-2 px-3 rounded bg-[#121212] hover:bg-[#202020] border border-[#262626] text-stone-300 text-[10px] font-bold font-mono uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Load a colorful abstract template to test tracing"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#00f0ff]" />
                  <span>LOAD TEST</span>
                </button>
              </div>
              <div className="text-[9px] text-stone-500 font-mono uppercase mt-1 text-center truncate">
                File: {imageFileName || "None"}
              </div>
            </div>

            {imageSrc && (
              <div className="flex flex-col gap-5 border-t border-[#262626] pt-4">
                <h4 className="text-[10px] font-bold font-mono text-[#ff007f] tracking-widest uppercase">
                  02 / COLOR HARMONY RANGE
                </h4>

                {/* Slider: Color Distance Tolerance */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                    <span className="text-stone-400 uppercase">COLOR VARIANCE</span>
                    <span className="text-[#ff007f] font-black">{tolerance} RGB</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="150"
                    step="1"
                    value={tolerance}
                    onChange={(e) => setTolerance(parseInt(e.target.value))}
                    className="w-full accent-[#ff007f] h-1 bg-black border border-[#262626] rounded appearance-none cursor-pointer"
                  />
                  <span className="text-[8.5px] text-stone-500 font-mono uppercase">
                    Higher values capture wider shades and gradients.
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
              </div>
            )}

            {/* Generated Layers in this session */}
            <div className="flex-1 flex flex-col min-h-[140px] border-t border-[#262626] pt-4">
              <h4 className="text-[10px] font-bold font-mono text-stone-400 tracking-widest uppercase mb-2 flex items-center justify-between">
                <span>03 / CAPTURED ISLANDS ({sessionTraces.length})</span>
                <Layers className="w-3 h-3 text-[#ff007f]" />
              </h4>
              <div className="flex-1 overflow-y-auto bg-black border border-[#262626] p-2 flex flex-col gap-1.5 max-h-[160px]">
                {sessionTraces.length === 0 ? (
                  <div className="text-[9px] text-stone-600 font-mono uppercase text-center py-8">
                    No islands captured yet.<br />Click on colors in the image!
                  </div>
                ) : (
                  sessionTraces.map((trace, idx) => (
                    <button 
                      key={trace.id} 
                      onClick={() => setSelectedTraceId(trace.id)}
                      className={`w-full flex items-center justify-between p-1.5 rounded-sm border transition-colors cursor-pointer text-left ${
                        selectedTraceId === trace.id 
                          ? "bg-[#180a10] border-[#ff007f]/50" 
                          : "bg-[#080808] border-[#202020] hover:bg-[#101010]"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 border border-stone-700 rounded-full shrink-0" 
                          style={{ backgroundColor: trace.colorHex }} 
                        />
                        <div className="text-[9.5px] font-mono text-stone-200 uppercase truncate">
                          {trace.colorName}
                        </div>
                      </div>
                      <span className="text-[8.5px] font-mono text-stone-500 uppercase shrink-0 font-bold bg-[#141414] px-1 border border-[#202020]">
                        {trace.pathCount} segment{trace.pathCount > 1 ? "s" : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Canvas Interactive Color-picker Space (Right column) */}
          <div className="md:col-span-8 p-6 flex flex-col min-h-[380px] bg-black">
            {imageSrc ? (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Back / Undo action bar above the preview image */}
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={handleBack}
                    disabled={sessionTraces.length === 0}
                    className={`py-2 px-4 border text-[10px] font-bold font-mono uppercase flex items-center gap-2 transition-all cursor-pointer ${
                      sessionTraces.length === 0
                        ? "bg-transparent border-[#202020] text-stone-600 cursor-not-allowed"
                        : "bg-[#180a10] border-[#ff007f] hover:border-[#ff007f]/80 text-[#ff007f] hover:text-[#ff007f]/80 hover:shadow-[0_0_12px_rgba(255,0,127,0.2)] active:scale-95"
                    }`}
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>← BACK (UNDO LAST ISLAND)</span>
                  </button>
                  <span className="text-[9px] font-mono text-stone-500 uppercase">
                    {sessionTraces.length} island{sessionTraces.length !== 1 ? "s" : ""} added
                  </span>
                </div>

                <div className="h-[480px] w-full flex flex-col items-center justify-center p-4 bg-[#0c0c0c] rounded border border-[#262626] relative overflow-hidden shrink-0">
                  
                  {/* Floating instructions */}
                  <span className="absolute top-3 left-3 text-[8.5px] font-mono bg-black/80 border border-[#262626] text-stone-400 px-2 py-0.5 rounded uppercase font-bold tracking-widest z-10 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-[#ff007f] animate-pulse" />
                    <span>CLICK COGNATE COLOR ISLAND TO VECTOR-SPLIT — EACH CLICK ADDS ONE CONTIGUOUS SHAPE</span>
                  </span>

                  {/* Offscreen canvas used to load image pixels (not displayed, hidden) */}
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Interactive container */}
                  <div 
                    ref={containerRef}
                    className="relative inline-block cursor-crosshair max-w-full max-h-[420px] border border-[#ff007f]/20 hover:border-[#ff007f]/50 transition-colors overflow-hidden select-none"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    onClick={handleImageClick}
                  >
                    <img
                      ref={imageRef}
                      src={imageSrc}
                      alt="Raster Color-pick Selection Source"
                      crossOrigin="anonymous"
                      onLoad={syncImageToCanvas}
                      className="block max-w-full max-h-[420px] w-auto h-auto pointer-events-none select-none"
                    />

                    {/* Absolute overlay SVG showing all currently added session traces */}
                    <svg 
                      className="absolute top-0 left-0 w-full h-full pointer-events-none"
                      viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {sessionTraces.map((trace) => (
                        <path 
                          key={trace.id} 
                          d={trace.pathD} 
                          fill={trace.colorHex} 
                          fillOpacity="0.45"
                          stroke={trace.colorHex} 
                          strokeWidth="2" 
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                    </svg>

                    {/* Hover color magnifying pipette indicator */}
                    {hoverColor && hoverPos && (
                      <div 
                        className="absolute pointer-events-none rounded-none border-2 shadow-lg flex flex-col items-center justify-center font-mono z-20"
                        style={{
                          left: `${hoverPos.x}px`,
                          top: `${hoverPos.y - 45}px`,
                          transform: "translateX(-50%)",
                          backgroundColor: "#000000e6",
                          borderColor: hoverColor.hex,
                          padding: "2px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          <div 
                            className="w-2.5 h-2.5 border border-white/20 rounded-full" 
                            style={{ backgroundColor: hoverColor.hex }} 
                          />
                          <span className="text-[9px] text-white font-bold tracking-tight">
                            {hoverColor.hex}
                          </span>
                        </div>
                        <span className="text-[7.5px] text-stone-400 uppercase font-black tracking-widest">
                          {getClosestColorName(hoverColor.r, hoverColor.g, hoverColor.b)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Live Hover Status */}
                  <div className="mt-4 flex items-center justify-between w-full max-w-md bg-black border border-[#202020] p-2 rounded text-[10px] font-mono">
                    <span className="text-stone-500 uppercase">CURRENT SENSOR COLOR:</span>
                    {hoverColor ? (
                      <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 rounded-full border border-stone-700" style={{ backgroundColor: hoverColor.hex }} />
                        <span className="text-white font-bold">{hoverColor.hex}</span>
                        <span className="text-[#ff007f] font-black uppercase">({getClosestColorName(hoverColor.r, hoverColor.g, hoverColor.b)})</span>
                      </div>
                    ) : (
                      <span className="text-stone-600 uppercase">MOVE MOUSE OVER UNCLAIMED COLORS...</span>
                    )}
                  </div>
                </div>

                {/* Edit last captured island form */}
                {activeTrace && (
                  <div className="mt-4 p-4 bg-[#0a0a0a] border border-[#ff007f]/30 rounded flex flex-col md:flex-row items-center gap-4 animate-in slide-in-from-bottom duration-200">
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-5 h-5 rounded-full border border-stone-700 shadow" style={{ backgroundColor: activeTrace.colorHex }} />
                      <span className="text-[10px] font-mono text-[#ff007f] uppercase font-bold tracking-wider">EDIT ACTIVE ISLAND:</span>
                    </div>

                    <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Edit Name Input */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[8.5px] font-mono text-stone-500 uppercase font-black">ISLAND LAYER NAME</label>
                        <input
                          type="text"
                          value={activeTrace.colorName}
                          onChange={(e) => {
                            const newName = e.target.value;
                            setSessionTraces(prev => prev.map(t => t.id === activeTrace.id ? { ...t, colorName: newName } : t));
                            if (activeTrace.zoneId) {
                              onUpdateTracedPath(activeTrace.zoneId, newName, activeTrace.colorHex);
                            }
                          }}
                          className="bg-black border border-[#262626] rounded px-2.5 py-1 text-white text-[10.5px] font-mono focus:border-[#ff007f] outline-none"
                        />
                      </div>

                      {/* Edit Hex Input */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[8.5px] font-mono text-stone-500 uppercase font-black">FILL/STROKE HEX COLOR</label>
                        <input
                          type="text"
                          value={activeTrace.colorHex}
                          onChange={(e) => {
                            const newHex = e.target.value;
                            setSessionTraces(prev => prev.map(t => t.id === activeTrace.id ? { ...t, colorHex: newHex } : t));
                            // Only update if valid hex format
                            if (activeTrace.zoneId && /^#[0-9A-F]{6}$/i.test(newHex)) {
                              onUpdateTracedPath(activeTrace.zoneId, activeTrace.colorName, newHex);
                            }
                          }}
                          className="bg-black border border-[#262626] rounded px-2.5 py-1 text-white text-[10.5px] font-mono focus:border-[#ff007f] outline-none"
                        />
                      </div>
                    </div>

                    <div className="shrink-0">
                      <span className="text-[9px] font-mono text-stone-500 bg-[#121212] px-2 py-1 rounded border border-[#202020] uppercase font-bold">
                        SYNCED LIVE
                      </span>
                    </div>
                  </div>
                )}

                {/* Confirm & Close */}
                <div className="mt-4 flex justify-between items-center gap-3">
                  <div className="text-[10px] text-stone-500 font-mono uppercase flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-stone-400" />
                    <span>Every click instantly adds a new color zone to the editor list!</span>
                  </div>
                  <button
                    onClick={onClose}
                    className="py-2 px-6 bg-gradient-to-r from-emerald-950/80 to-emerald-900 border border-emerald-500 hover:border-emerald-400 text-emerald-100 text-[10px] font-bold font-mono uppercase tracking-widest flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.15)] hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-98"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>FINISH VECTOR PICKING</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 border border-dashed border-[#262626] bg-[#0c0c0c] rounded">
                <ImageIcon className="w-10 h-10 text-stone-700 mb-3 animate-pulse" />
                <span className="text-xs text-stone-400 font-mono uppercase tracking-widest font-bold">
                  No Interactive File Calibrated
                </span>
                <span className="text-[10px] text-stone-600 font-mono uppercase mt-1">
                  Upload an image above or load our high contrast paint swirl preset.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
