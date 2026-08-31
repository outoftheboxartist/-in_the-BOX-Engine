/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Upload,
  Film,
  Sparkles,
  Play,
  Pause,
  Sliders,
  Check,
  Tag,
  FolderPlus,
  Layers,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Zap,
} from "lucide-react";
import { decodeGifFile, resampleGifFrames, DecodedGifResult } from "../utils/gifDecoder";
import { saveCustomGif, CustomUploadedGif } from "../utils/customGifStorage";
import { ZoneSettings } from "../types";

export const PRESET_CATEGORIES = [
  { id: "quadruped", label: "Quadruped / Animals", icon: "🐎", desc: "Horses, panthers, cheetahs, dogs" },
  { id: "birds", label: "Birds & Flight", icon: "🦅", desc: "Eagles, bats, butterflies, wings" },
  { id: "aquatic", label: "Marine & Aquatic", icon: "🐬", desc: "Fish, jellyfish, dolphins, sharks" },
  { id: "humanoid", label: "Humanoid & Athletics", icon: "🏃", desc: "Walking, running, spinning athletes" },
  { id: "mechanical", label: "Mechanical & Wheels", icon: "⚙️", desc: "Cogwheels, pistons, turbines" },
  { id: "celestial", label: "Celestial & Radial", icon: "🌟", desc: "Starbursts, spirals, galaxies" },
  { id: "serpentine", label: "Waves & Serpentine", icon: "🌊", desc: "Sine waves, serpents, ripples" },
  { id: "organic", label: "Organic & Botanical", icon: "🌸", desc: "Flowers, hearts, foliage" },
  { id: "custom", label: "Custom / General", icon: "📁", desc: "Other custom animations" },
] as const;

interface UploadGifModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetZoneSettings: ZoneSettings | null;
  onApplyFrames?: (frameDataUrls: string[]) => void;
  onGifSaved?: (gif: CustomUploadedGif) => void;
  showStatus?: (text: string, type?: "success" | "error" | "info") => void;
}

export function UploadGifModal({
  isOpen,
  onClose,
  targetZoneSettings,
  onApplyFrames,
  onGifSaved,
  showStatus,
}: UploadGifModalProps) {
  const [gifResult, setGifResult] = useState<DecodedGifResult | null>(null);
  const [fileOriginalName, setFileOriginalName] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<typeof PRESET_CATEGORIES[number]["id"]>("quadruped");
  const [tagsInput, setTagsInput] = useState<string>("");
  const [isHighContrast, setIsHighContrast] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Trimming & playback state
  const [startIndex, setStartIndex] = useState<number>(0);
  const [endIndex, setEndIndex] = useState<number>(0);
  const [previewIndex, setPreviewIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetCount = targetZoneSettings?.frameCount || 6;

  // Reset state on open
  useEffect(() => {
    if (!isOpen) {
      setGifResult(null);
      setFileOriginalName("");
      setTitle("");
      setSelectedCategory("quadruped");
      setTagsInput("");
      setIsHighContrast(true);
      setIsLoading(false);
      setErrorMessage(null);
      setStartIndex(0);
      setEndIndex(0);
      setPreviewIndex(0);
    }
  }, [isOpen]);

  const handleFileSelect = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".gif") && file.type !== "image/gif") {
      setErrorMessage("Please select an animated GIF (.gif) file.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setFileOriginalName(file.name);
    const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));

    try {
      const decoded = await decodeGifFile(file);
      setGifResult(decoded);
      setStartIndex(0);
      setEndIndex(decoded.frames.length - 1);
      setPreviewIndex(0);
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

  const allFrameUrls = gifResult ? gifResult.frames.map((f) => f.dataUrl) : [];
  const sampledFrames = resampleGifFrames(allFrameUrls, targetCount, [startIndex, endIndex]);
  const trimmedFrames = allFrameUrls.slice(startIndex, endIndex + 1);

  // Playback timer
  useEffect(() => {
    if (isPlaying && trimmedFrames.length > 0) {
      const currentDelay = (gifResult?.frames[startIndex + previewIndex]?.delay || 100) / playbackSpeed;
      playTimerRef.current = setTimeout(() => {
        setPreviewIndex((prev) => (prev + 1) % trimmedFrames.length);
      }, Math.max(20, currentDelay));
    }
    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, [isPlaying, previewIndex, trimmedFrames.length, playbackSpeed, startIndex, gifResult]);

  const handleSaveAndApply = (applyToCurve: boolean = true) => {
    if (!gifResult || sampledFrames.length === 0) {
      showStatus?.("Please upload a valid GIF first.", "error");
      return;
    }

    const catObj = PRESET_CATEGORIES.find((c) => c.id === selectedCategory);
    const categoryLabel = catObj ? catObj.label : "Custom";

    const parsedTags = tagsInput
      .split(/[, ]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const newGifItem: CustomUploadedGif = {
      id: `custom-gif-${Date.now()}`,
      title: title.trim() || fileOriginalName || "Custom GIF",
      category: selectedCategory,
      categoryLabel,
      url: allFrameUrls[0] || "",
      previewUrl: allFrameUrls[0] || "",
      frames: sampledFrames,
      contrastLevel: isHighContrast ? "ultra" : "high",
      tags: [selectedCategory, ...parsedTags, isHighContrast ? "bw" : "color", "custom-upload"],
      createdAt: Date.now(),
    };

    saveCustomGif(newGifItem);
    onGifSaved?.(newGifItem);

    if (applyToCurve && onApplyFrames) {
      onApplyFrames(sampledFrames);
      showStatus?.(
        `Saved '${newGifItem.title}' under '${categoryLabel}' & applied to ${targetZoneSettings?.zoneName || "curve"}!`,
        "success"
      );
    } else {
      showStatus?.(`Saved '${newGifItem.title}' to '${categoryLabel}' library!`, "success");
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="bg-[#0c0c0c] border border-[#262626] w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-mono"
      >
        {/* Header */}
        <div className="p-4 bg-black border-b border-[#262626] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#ff007f]/10 border border-[#ff007f]/40 text-[#ff007f]">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wider uppercase flex items-center gap-2">
                <span>UPLOAD GIF & SELECT CATEGORY</span>
                <span className="text-[10px] text-[#00f0ff] bg-[#00f0ff]/10 px-2 py-0.5 border border-[#00f0ff]/30">
                  SCANCLIPS LIBRARY
                </span>
              </h2>
              <p className="text-[11px] text-stone-400 font-sans">
                Upload your animated GIF, select its motion category, trim frames, and save to your motion presets.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-white hover:bg-[#1f1f1f] rounded transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 min-h-0">
          {!gifResult ? (
            /* Upload Drop Area */
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 min-h-[300px] border-2 border-dashed border-[#333] hover:border-[#ff007f] bg-black/50 hover:bg-[#141414] flex flex-col items-center justify-center p-8 text-center cursor-pointer transition-all gap-3 group"
            >
              <div className="p-4 rounded-full bg-[#181818] group-hover:bg-[#ff007f]/20 group-hover:text-[#ff007f] text-stone-400 transition-colors">
                <Upload className="w-8 h-8" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold text-white group-hover:text-[#ff007f] transition-colors">
                  {isLoading ? "Decoding GIF frames..." : "DRAG & DROP GIF FILE HERE"}
                </span>
                <span className="text-xs text-stone-400 font-sans">
                  or click to browse local .gif files from your computer
                </span>
              </div>

              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-[#00f0ff] animate-pulse mt-2">
                  <Film className="w-4 h-4" />
                  <span>Parsing color palettes & frame sequence...</span>
                </div>
              )}

              {errorMessage && (
                <div className="p-2 bg-red-950/50 border border-red-500/50 text-red-300 text-xs flex items-center gap-2 mt-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/gif"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
            </div>
          ) : (
            /* GIF Details & Categorization Form */
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left Column: Preview & Trimmer (5 cols) */}
              <div className="md:col-span-5 flex flex-col gap-3 bg-[#111] p-3 border border-[#222]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#00f0ff] uppercase flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5" />
                    LIVE ANIMATION PREVIEW
                  </span>
                  <button
                    onClick={() => {
                      setGifResult(null);
                      setFileOriginalName("");
                    }}
                    className="text-[10px] text-stone-400 hover:text-stone-200 underline cursor-pointer"
                  >
                    Change File
                  </button>
                </div>

                {/* Main Preview Box */}
                <div className="aspect-square bg-black border border-[#333] flex items-center justify-center overflow-hidden relative group">
                  {trimmedFrames.length > 0 && (
                    <img
                      src={trimmedFrames[previewIndex]}
                      alt={`Preview frame ${previewIndex}`}
                      className="max-h-full max-w-full object-contain"
                    />
                  )}

                  {/* Play/Pause Overlay Button */}
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer text-white"
                  >
                    <div className="p-3 bg-black/80 border border-white/20 rounded-full">
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </div>
                  </button>

                  <div className="absolute bottom-2 left-2 bg-black/80 px-2 py-0.5 border border-[#333] text-[9px] text-[#00f0ff]">
                    FRAME {startIndex + previewIndex + 1} / {gifResult.frames.length}
                  </div>
                </div>

                {/* Trimmer Controls */}
                <div className="flex flex-col gap-2 bg-black/60 p-2.5 border border-[#222] text-[11px]">
                  <div className="flex items-center justify-between text-stone-400">
                    <span>TRIM RANGE:</span>
                    <span className="text-white font-bold">
                      {endIndex - startIndex + 1} of {gifResult.frames.length} frames
                    </span>
                  </div>

                  {/* Range inputs */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone-500">START:</span>
                    <input
                      type="range"
                      min={0}
                      max={endIndex}
                      value={startIndex}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setStartIndex(val);
                        setPreviewIndex(0);
                      }}
                      className="flex-1 accent-[#ff007f]"
                    />
                    <span className="w-6 text-right font-bold text-[#ff007f]">{startIndex + 1}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone-500">END:</span>
                    <input
                      type="range"
                      min={startIndex}
                      max={gifResult.frames.length - 1}
                      value={endIndex}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setEndIndex(val);
                        setPreviewIndex(0);
                      }}
                      className="flex-1 accent-[#00f0ff]"
                    />
                    <span className="w-6 text-right font-bold text-[#00f0ff]">{endIndex + 1}</span>
                  </div>

                  {/* Resample notification */}
                  <div className="pt-2 border-t border-[#222] flex items-center justify-between text-[10px] text-[#00f0ff]">
                    <span>SLICED OUTPUT:</span>
                    <span className="font-bold bg-[#00f0ff]/10 px-1.5 py-0.5 border border-[#00f0ff]/30">
                      {targetCount} FRAMES (FOR THIS CURVE)
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Metadata & Category Selection (7 cols) */}
              <div className="md:col-span-7 flex flex-col gap-4 bg-[#0e0e0e] p-3 border border-[#222]">
                {/* Title Input */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-stone-300 uppercase">
                    GIF TITLE / NAME
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Galloping Stallion Silhouette"
                    className="bg-black border border-[#333] focus:border-[#00f0ff] text-white px-3 py-2 text-xs focus:outline-none"
                  />
                </div>

                {/* Category Selection Grid */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#ff007f] uppercase flex items-center gap-1.5">
                    <FolderPlus className="w-3.5 h-3.5" />
                    SELECT CATEGORY (RE-CATEGORIZATION)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 bg-black/40 border border-[#262626]">
                    {PRESET_CATEGORIES.map((cat) => {
                      const isSelected = selectedCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`p-2 text-left border flex flex-col gap-1 transition-all cursor-pointer ${
                            isSelected
                              ? "bg-[#ff007f]/20 border-[#ff007f] text-white shadow-[0_0_10px_rgba(255,0,127,0.3)]"
                              : "bg-[#141414] border-[#262626] text-stone-400 hover:border-[#444] hover:text-stone-200"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{cat.icon}</span>
                            <span className="text-[10px] font-bold truncate">{cat.label}</span>
                          </div>
                          <span className="text-[8.5px] text-stone-500 font-sans leading-tight line-clamp-1">
                            {cat.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tags & High-Contrast Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-stone-400 uppercase flex items-center gap-1">
                      <Tag className="w-3 h-3 text-[#00f0ff]" />
                      SEARCH TAGS (COMMA SEPARATED)
                    </label>
                    <input
                      type="text"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="e.g. running, horse, fast, black"
                      className="bg-black border border-[#333] focus:border-[#00f0ff] text-white px-2 py-1.5 text-xs focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col justify-end">
                    <label
                      onClick={() => setIsHighContrast(!isHighContrast)}
                      className="flex items-center gap-2 bg-black border border-[#333] hover:border-[#ff007f]/40 p-2 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isHighContrast}
                        onChange={() => {}}
                        className="accent-[#ff007f]"
                      />
                      <div className="flex flex-col">
                        <span className="text-[10.5px] font-bold text-white flex items-center gap-1">
                          <Zap className="w-3 h-3 text-[#ffe600]" />
                          SOLID B&W SILHOUETTE
                        </span>
                        <span className="text-[8.5px] text-stone-400 font-sans">
                          Optimized for barrier-grid scanimations
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Summary Box */}
                <div className="mt-auto p-2.5 bg-black/80 border border-[#262626] text-[10.5px] text-stone-400 font-sans flex items-center justify-between">
                  <div>
                    Category:{" "}
                    <span className="text-[#00f0ff] font-bold font-mono">
                      {PRESET_CATEGORIES.find((c) => c.id === selectedCategory)?.label}
                    </span>
                  </div>
                  <div className="text-[#ff007f] font-mono font-bold">
                    {sampledFrames.length} Slices Ready
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-black border-t border-[#262626] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#181818] hover:bg-[#252525] border border-[#333] text-stone-300 text-xs font-bold transition-all cursor-pointer"
          >
            CANCEL
          </button>

          {gifResult && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSaveAndApply(false)}
                className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#ff007f]/40 text-[#ff007f] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                title="Save to library presets only without overwriting current curve frames"
              >
                <FolderPlus className="w-4 h-4" />
                <span>SAVE TO PRESETS ONLY</span>
              </button>

              <button
                onClick={() => handleSaveAndApply(true)}
                className="px-5 py-2 bg-gradient-to-r from-[#ff007f] to-[#00f0ff] hover:opacity-90 text-black text-xs font-black transition-all cursor-pointer flex items-center gap-2 shadow-[0_0_15px_rgba(255,0,127,0.3)] active:scale-95"
              >
                <Check className="w-4 h-4 text-black" />
                <span>SAVE & APPLY TO CURVE</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
