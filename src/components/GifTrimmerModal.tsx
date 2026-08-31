/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  X, Film, Play, Pause, Scissors, Sparkles, Check, 
  RotateCcw, Sliders, ChevronLeft, ChevronRight, Upload, AlertCircle, Info 
} from "lucide-react";
import { decodeGifFile, resampleGifFrames, DecodedGifResult } from "../utils/gifDecoder";
import { ZoneSettings } from "../types";

interface GifTrimmerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetZoneSettings: ZoneSettings | null;
  onApplyFrames: (frameDataUrls: string[]) => void;
  showStatus?: (text: string, type: "success" | "error" | "info") => void;
}

export function GifTrimmerModal({
  isOpen,
  onClose,
  targetZoneSettings,
  onApplyFrames,
  showStatus,
}: GifTrimmerModalProps) {
  const [gifResult, setGifResult] = useState<DecodedGifResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Trimming range state (0-indexed)
  const [startIndex, setStartIndex] = useState<number>(0);
  const [endIndex, setEndIndex] = useState<number>(0);

  // Playback preview state
  const [previewFrameIndex, setPreviewFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Target count required by current curve
  const targetCount = targetZoneSettings?.frameCount || 6;

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset on modal open
  useEffect(() => {
    if (!isOpen) {
      setGifResult(null);
      setIsLoading(false);
      setErrorMessage(null);
      setStartIndex(0);
      setEndIndex(0);
      setPreviewFrameIndex(0);
    }
  }, [isOpen]);

  const handleFileSelect = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".gif") && file.type !== "image/gif") {
      setErrorMessage("Please select an animated GIF (.gif) file.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const decoded = await decodeGifFile(file);
      setGifResult(decoded);
      setStartIndex(0);
      setEndIndex(decoded.frames.length - 1);
      setPreviewFrameIndex(0);
      setIsPlaying(true);
      showStatus?.(`Loaded ${decoded.frames.length} frames from ${file.name}`, "success");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to decode GIF animation.");
      showStatus?.("Failed to parse GIF file.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Compute the trimmed and sampled frames
  const allFrameUrls = gifResult ? gifResult.frames.map((f) => f.dataUrl) : [];
  const sampledFrames = resampleGifFrames(allFrameUrls, targetCount, [startIndex, endIndex]);

  // Trimmed frames for animated preview loop
  const trimmedFrames = allFrameUrls.slice(startIndex, endIndex + 1);

  // Animation player loop
  useEffect(() => {
    if (isPlaying && trimmedFrames.length > 0) {
      const currentDelay = (gifResult?.frames[startIndex + previewFrameIndex]?.delay || 100) / playbackSpeed;
      playTimerRef.current = setTimeout(() => {
        setPreviewFrameIndex((prev) => (prev + 1) % trimmedFrames.length);
      }, Math.max(20, currentDelay));
    }
    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, [isPlaying, previewFrameIndex, trimmedFrames.length, playbackSpeed, startIndex, gifResult]);

  const handleApply = () => {
    if (sampledFrames.length === 0) {
      showStatus?.("No frames to apply.", "error");
      return;
    }
    onApplyFrames(sampledFrames);
    showStatus?.(
      `Applied ${sampledFrames.length} trimmed frames to ${targetZoneSettings?.zoneName || "curve"}!`,
      "success"
    );
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div 
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="bg-[#0c0c0c] border border-[#262626] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-4 bg-black border-b border-[#262626] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#00f0ff]/10 border border-[#00f0ff]/30 text-[#00f0ff]">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[#00f0ff] font-mono text-[10px] font-bold tracking-widest uppercase">
                  [INTHE] GIF SAMPLER & TRIMMER
                </span>
                <span className="text-stone-500 text-[10px] font-mono font-normal">|</span>
                <span className="text-stone-300 text-[10px] font-mono font-bold bg-[#1a1a1a] px-2 py-0.5 border border-[#333]">
                  TARGET: {targetCount} FRAMES
                </span>
              </div>
              <h2 className="text-sm font-bold font-mono tracking-wider text-white uppercase mt-0.5">
                Trim & Resample Animated GIF for {targetZoneSettings?.zoneName || "Active Curve"}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#1a1a1a] text-stone-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-5">
          {/* If no GIF loaded yet */}
          {!gifResult && !isLoading && (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-[#262626] hover:border-[#00f0ff]/50 bg-black/40 rounded-none p-12 text-center transition-all">
              <Film className="w-12 h-12 text-stone-600 mb-3 animate-pulse" />
              <h3 className="text-stone-200 font-mono text-sm font-bold uppercase tracking-wider mb-1">
                Upload or Drop Animated GIF File
              </h3>
              <p className="text-stone-500 font-mono text-xs max-w-md mb-5 leading-relaxed">
                The trimmer will decode all GIF frames and intelligently resample them to precisely match the{" "}
                <span className="text-[#00f0ff] font-bold">{targetCount} frames</span> configured for this scanimation vector curve.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".gif,image/gif"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
                className="hidden"
                id="gif-file-input"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 bg-[#00f0ff] hover:bg-[#00c8d6] text-black font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer active:scale-95 shadow-lg"
              >
                <Upload className="w-4 h-4 text-black" />
                <span>Select GIF From Disk</span>
              </button>

              {errorMessage && (
                <div className="mt-4 p-2 px-3 bg-rose-950/80 border border-rose-600/30 text-rose-300 font-mono text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
          )}

          {/* Loading spinner */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <div className="w-10 h-10 border-2 border-[#00f0ff] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-[#00f0ff] font-mono text-xs font-bold uppercase tracking-widest">
                Decoding GIF Frame Data & Palette Colors...
              </p>
            </div>
          )}

          {/* Loaded GIF editor */}
          {gifResult && !isLoading && (
            <div className="flex flex-col gap-5">
              {/* Top Row: Live Animated Preview + Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Left: Trimmed Animation Loop Preview */}
                <div className="flex flex-col bg-black border border-[#262626] p-3 items-center justify-center relative min-h-[220px]">
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/80 border border-[#333] text-[9px] font-mono text-[#00f0ff] uppercase">
                    TRIMMED LOOP PREVIEW
                  </div>

                  {trimmedFrames[previewFrameIndex] ? (
                    <img
                      src={trimmedFrames[previewFrameIndex]}
                      alt="Preview frame"
                      className="max-h-[160px] max-w-full object-contain rounded border border-[#222] bg-[#111]"
                    />
                  ) : (
                    <div className="text-stone-600 text-xs font-mono">No preview</div>
                  )}

                  {/* Playback controls */}
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="p-1.5 bg-[#1a1a1a] hover:bg-[#262626] text-stone-200 rounded border border-[#333] cursor-pointer"
                      title={isPlaying ? "Pause preview" : "Play preview"}
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-[#00f0ff]" />}
                    </button>

                    <div className="text-[10px] font-mono text-stone-400">
                      Frame: <span className="text-[#00f0ff] font-bold">{startIndex + previewFrameIndex + 1}</span> / {gifResult.frames.length}
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-mono text-stone-500">SPEED:</span>
                      {[0.5, 1, 2].map((s) => (
                        <button
                          key={s}
                          onClick={() => setPlaybackSpeed(s)}
                          className={`px-1.5 py-0.5 text-[9px] font-mono cursor-pointer border ${
                            playbackSpeed === s
                              ? "bg-[#00f0ff]/20 border-[#00f0ff] text-[#00f0ff]"
                              : "bg-[#111] border-[#333] text-stone-400 hover:text-stone-200"
                          }`}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Center & Right: Trimming controls & Info */}
                <div className="md:col-span-2 flex flex-col justify-between bg-black/60 border border-[#262626] p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Scissors className="w-4 h-4 text-[#ff007f]" />
                        <span className="text-xs font-mono font-bold uppercase text-white tracking-wider">
                          Trim Animation Range
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-stone-400">
                        Total Frames: <span className="text-white font-bold">{gifResult.frames.length}</span> ({gifResult.width}×{gifResult.height}px)
                      </div>
                    </div>

                    {/* Range Sliders */}
                    <div className="flex flex-col gap-3 p-3 bg-[#111] border border-[#222]">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-stone-400">
                          Start Frame: <span className="text-[#00f0ff] font-bold">{startIndex + 1}</span>
                        </span>
                        <span className="text-stone-400">
                          End Frame: <span className="text-[#ff007f] font-bold">{endIndex + 1}</span>
                        </span>
                        <span className="text-stone-400">
                          Range Length: <span className="text-white font-bold">{endIndex - startIndex + 1} frames</span>
                        </span>
                      </div>

                      {/* Dual sliders */}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-stone-500 w-12 shrink-0">START:</span>
                          <input
                            type="range"
                            min="0"
                            max={Math.max(0, endIndex - 1)}
                            value={startIndex}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setStartIndex(val);
                              setPreviewFrameIndex(0);
                            }}
                            className="flex-1 accent-[#00f0ff] cursor-pointer h-1.5 bg-[#222]"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-stone-500 w-12 shrink-0">END:</span>
                          <input
                            type="range"
                            min={Math.min(gifResult.frames.length - 1, startIndex + 1)}
                            max={gifResult.frames.length - 1}
                            value={endIndex}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setEndIndex(val);
                              setPreviewFrameIndex(0);
                            }}
                            className="flex-1 accent-[#ff007f] cursor-pointer h-1.5 bg-[#222]"
                          />
                        </div>
                      </div>

                      {/* Quick presets */}
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[9px] font-mono text-stone-500">QUICK:</span>
                        <button
                          onClick={() => {
                            setStartIndex(0);
                            setEndIndex(gifResult.frames.length - 1);
                          }}
                          className="px-2 py-0.5 text-[9px] font-mono bg-[#1a1a1a] hover:bg-[#262626] text-stone-300 border border-[#333] cursor-pointer"
                        >
                          Full Range
                        </button>
                        <button
                          onClick={() => {
                            setStartIndex(0);
                            setEndIndex(Math.min(gifResult.frames.length - 1, targetCount - 1));
                          }}
                          className="px-2 py-0.5 text-[9px] font-mono bg-[#1a1a1a] hover:bg-[#262626] text-stone-300 border border-[#333] cursor-pointer"
                        >
                          First {targetCount} Frames
                        </button>
                        <button
                          onClick={() => {
                            setStartIndex(Math.max(0, gifResult.frames.length - targetCount));
                            setEndIndex(gifResult.frames.length - 1);
                          }}
                          className="px-2 py-0.5 text-[9px] font-mono bg-[#1a1a1a] hover:bg-[#262626] text-stone-300 border border-[#333] cursor-pointer"
                        >
                          Last {targetCount} Frames
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-stone-400 bg-black/40 p-2 border border-[#222]">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#00f0ff]" />
                      <span>
                        Resampling Strategy: <strong className="text-white">Smart Even Distribution</strong>
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setGifResult(null);
                      }}
                      className="text-stone-500 hover:text-stone-300 underline cursor-pointer"
                    >
                      Choose Different GIF
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom Row: Exact Output Slices for Curve (Target Frames) */}
              <div className="flex flex-col gap-2 bg-black border border-[#262626] p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold uppercase text-[#00f0ff] tracking-wider">
                      Resampled Output ({sampledFrames.length} Frames for {targetZoneSettings?.zoneName || "Curve"})
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-stone-500">
                    These {sampledFrames.length} frames will fill the curve's scanimation timeline
                  </span>
                </div>

                {/* Filmstrip of output frames */}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-1">
                  {sampledFrames.map((frameUrl, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col items-center bg-[#111] border border-[#262626] hover:border-[#00f0ff] p-1.5 transition-all group"
                    >
                      <div className="w-full aspect-square flex items-center justify-center bg-black overflow-hidden relative">
                        <img
                          src={frameUrl}
                          alt={`Sampled frame ${idx + 1}`}
                          className="max-h-full max-w-full object-contain"
                        />
                        <div className="absolute top-1 left-1 px-1 bg-black/80 text-[9px] font-mono text-[#00f0ff] font-bold">
                          F{idx + 1}
                        </div>
                      </div>
                      <span className="text-[9px] font-mono text-stone-400 mt-1">
                        Frame #{idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-black border-t border-[#262626] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#262626] text-stone-300 font-mono text-xs font-bold uppercase transition-colors cursor-pointer border border-[#333]"
          >
            Cancel
          </button>

          {gifResult && (
            <button
              onClick={handleApply}
              className="px-6 py-2.5 bg-[#00f0ff] hover:bg-[#00c8d6] active:scale-95 text-black font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg"
            >
              <Check className="w-4 h-4 text-black" />
              <span>Apply {sampledFrames.length} Frames to {targetZoneSettings?.zoneName || "Curve"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
