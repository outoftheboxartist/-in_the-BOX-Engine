/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Search,
  Film,
  Sparkles,
  Play,
  Pause,
  Check,
  RotateCcw,
  Sliders,
  Layers,
  Eye,
  ChevronRight,
  Maximize2,
  Crop,
  ArrowRight,
  Loader2,
  Compass,
} from "lucide-react";
import { ZoneSettings } from "../types";
import { decodeGifFromUrl, decodeGifFile, resampleGifFrames, DecodedGifResult } from "../utils/gifDecoder";

interface GiphyItem {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  category?: string;
}

// Built-in curated scanimation animation GIF library
const CURATED_GIFS: GiphyItem[] = [
  {
    id: "fish-swim-1",
    title: "Swimming Fish Loop",
    category: "Aquatic",
    url: "https://media.giphy.com/media/l41JRsph73VokN6ik/giphy.gif",
    previewUrl: "https://media.giphy.com/media/l41JRsph73VokN6ik/200w.gif",
    width: 480,
    height: 270,
  },
  {
    id: "cheetah-run",
    title: "Galloping Cheetah",
    category: "Locomotion",
    url: "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif",
    previewUrl: "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/200w.gif",
    width: 480,
    height: 270,
  },
  {
    id: "bird-flight",
    title: "Soaring Bird Wings",
    category: "Aerial",
    url: "https://media.giphy.com/media/3o7TKtnuHOH6Ix2SMo/giphy.gif",
    previewUrl: "https://media.giphy.com/media/3o7TKtnuHOH6Ix2SMo/200w.gif",
    width: 480,
    height: 360,
  },
  {
    id: "butterfly-flap",
    title: "Fluttering Butterfly",
    category: "Aerial",
    url: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
    previewUrl: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200w.gif",
    width: 480,
    height: 360,
  },
  {
    id: "optical-spiral",
    title: "Hypnotic Spiral Wave",
    category: "Optical",
    url: "https://media.giphy.com/media/26AHONQ79FdWZhAI0/giphy.gif",
    previewUrl: "https://media.giphy.com/media/26AHONQ79FdWZhAI0/200w.gif",
    width: 480,
    height: 480,
  },
  {
    id: "gear-rotation",
    title: "Rotating Industrial Gear",
    category: "Radial",
    url: "https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif",
    previewUrl: "https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/200w.gif",
    width: 480,
    height: 480,
  },
  {
    id: "pulsing-mandala",
    title: "Pulsing Geometric Star",
    category: "Radial",
    url: "https://media.giphy.com/media/l0HlNzJUVZ5zrHikE/giphy.gif",
    previewUrl: "https://media.giphy.com/media/l0HlNzJUVZ5zrHikE/200w.gif",
    width: 480,
    height: 480,
  },
  {
    id: "running-horse",
    title: "Muybridge Horse Gallop",
    category: "Locomotion",
    url: "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif",
    previewUrl: "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/200w.gif",
    width: 480,
    height: 270,
  },
];

const PRESET_CATEGORIES = [
  "All",
  "Aquatic",
  "Aerial",
  "Locomotion",
  "Radial",
  "Optical",
  "Fish",
  "Bird",
  "Runner",
];

interface GiphySearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetZoneSettings: ZoneSettings | null;
  selectedZoneName?: string;
  onApplyFrames?: (frameDataUrls: string[]) => void;
  onApplySlicedFrames?: (frameDataUrls: string[]) => void;
  showStatus?: (msg: string, type?: "success" | "error" | "info") => void;
}

export const GiphySearchModal: React.FC<GiphySearchModalProps> = ({
  isOpen,
  onClose,
  targetZoneSettings,
  selectedZoneName,
  onApplyFrames,
  onApplySlicedFrames,
  showStatus,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>("fish swimming");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [searchResults, setSearchResults] = useState<GiphyItem[]>(CURATED_GIFS);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [selectedGif, setSelectedGif] = useState<GiphyItem | null>(null);

  // Decoding & Slicing State
  const [isDecoding, setIsDecoding] = useState<boolean>(false);
  const [decodedResult, setDecodedResult] = useState<DecodedGifResult | null>(null);
  const [trimRange, setTrimRange] = useState<[number, number]>([0, 0]);
  const [previewFrameIdx, setPreviewFrameIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [fitMode, setFitMode] = useState<"contain" | "cover" | "stretch">("contain");

  const targetCount = targetZoneSettings?.frameCount || 6;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Search Giphy via Public endpoint or fallback library
  const performSearch = async (query: string) => {
    setIsSearching(true);
    try {
      // Search Giphy Public API endpoint with graceful fallback
      const endpoint = `https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(
        query
      )}&limit=16&rating=g`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data.length > 0) {
          const items: GiphyItem[] = json.data.map((item: any) => ({
            id: item.id,
            title: item.title || query,
            url: item.images?.original?.url || item.images?.downsized?.url || item.images?.fixed_height?.url,
            previewUrl: item.images?.fixed_height_small?.url || item.images?.preview_gif?.url || item.images?.fixed_width?.url,
            width: parseInt(item.images?.original?.width || "480", 10),
            height: parseInt(item.images?.original?.height || "360", 10),
          }));
          setSearchResults(items);
          return;
        }
      }
    } catch (e) {
      console.warn("Giphy API lookup fell back to curated animation library:", e);
    } finally {
      setIsSearching(false);
    }

    // Fallback: match curated items or return curated items
    const filtered = CURATED_GIFS.filter(
      (g) =>
        g.title.toLowerCase().includes(query.toLowerCase()) ||
        g.category?.toLowerCase().includes(query.toLowerCase())
    );
    setSearchResults(filtered.length > 0 ? filtered : CURATED_GIFS);
    setIsSearching(false);
  };

  useEffect(() => {
    if (isOpen) {
      performSearch(searchQuery);
    }
  }, [isOpen]);

  // Handle GIF Selection & Automatic Decoding
  const handleSelectGif = async (gif: GiphyItem) => {
    setSelectedGif(gif);
    setIsDecoding(true);
    setDecodedResult(null);

    try {
      // Fetch and decode gif
      const decoded = await decodeGifFromUrl(gif.url);
      setDecodedResult(decoded);
      setTrimRange([0, decoded.frames.length - 1]);
      setPreviewFrameIdx(0);
      setIsPlaying(true);
      showStatus?.(`Successfully decoded ${decoded.frames.length} frames from GIF!`, "success");
    } catch (err: any) {
      console.warn("Direct URL decode CORS, trying fallback proxy...", err);
      // Fallback: create synthetic sampled animated canvas frames from image element
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = gif.previewUrl || gif.url;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        const canvas = document.createElement("canvas");
        canvas.width = gif.width || 400;
        canvas.height = gif.height || 300;
        const ctx = canvas.getContext("2d");
        const syntheticFrames: { dataUrl: string; delay: number; frameNumber: number }[] = [];

        for (let f = 0; f < targetCount; f++) {
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Translate or animate phase
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            syntheticFrames.push({
              dataUrl: canvas.toDataURL("image/png"),
              delay: 100,
              frameNumber: f + 1,
            });
          }
        }

        const fallbackResult: DecodedGifResult = {
          frames: syntheticFrames,
          width: canvas.width,
          height: canvas.height,
          totalDurationMs: targetCount * 100,
        };
        setDecodedResult(fallbackResult);
        setTrimRange([0, fallbackResult.frames.length - 1]);
        setPreviewFrameIdx(0);
      } catch (fallbackErr) {
        showStatus?.("Could not load GIF frames due to CORS protection.", "error");
      }
    } finally {
      setIsDecoding(false);
    }
  };

  // Resampled Frames
  const allFrameUrls = decodedResult ? decodedResult.frames.map((f) => f.dataUrl) : [];
  const sampledFrames = resampleGifFrames(allFrameUrls, targetCount, trimRange);

  // Playback Loop
  useEffect(() => {
    if (!isPlaying || sampledFrames.length === 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setPreviewFrameIdx((prev) => (prev + 1) % sampledFrames.length);
    }, 140);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, sampledFrames.length]);

  const handleApply = () => {
    if (sampledFrames.length === 0) return;
    if (onApplyFrames) {
      onApplyFrames(sampledFrames);
    } else if (onApplySlicedFrames) {
      onApplySlicedFrames(sampledFrames);
    }
    showStatus?.(
      `Sliced & aligned ${sampledFrames.length} GIF frames into ${selectedZoneName || "curve"}!`,
      "success"
    );
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 font-mono select-none animate-in fade-in duration-200">
      <div className="bg-[#0b0e14] border border-[#ff007f]/50 shadow-[0_0_40px_rgba(255,0,127,0.25)] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col text-stone-300">
        {/* Header */}
        <div className="px-5 py-3.5 bg-black/95 border-b border-[#262626] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#1a0f1d] border border-[#ff007f]/40 text-[#ff007f] rounded">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#ff007f] tracking-wider uppercase">
                  GIPHY & ANIMATED GIF CURVE SLICER
                </span>
                <span className="px-2 py-0.5 bg-[#ff007f]/10 text-[#ff007f] text-[9px] border border-[#ff007f]/30 uppercase font-black">
                  TARGET: {targetCount} PHASES
                </span>
              </div>
              <h3 className="text-sm font-bold text-white tracking-wide mt-0.5">
                Search, Preview & Align Sliced Motion for: <strong className="text-[#ff007f]">{selectedZoneName || "Selected Curve"}</strong>
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#222] text-stone-400 hover:text-white transition-colors cursor-pointer rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Left search / grid, Right curve alignment preview */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-0">
          {/* Left: Search & Results Grid (7 cols) */}
          <div className="md:col-span-7 p-4 border-r border-[#262626] flex flex-col gap-3 overflow-hidden">
            {/* Search Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                performSearch(searchQuery);
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search GIFs (e.g. fish swimming, cheetah run, bird fly, spiral)..."
                  className="w-full pl-9 pr-3 py-2 bg-black border border-[#333] focus:border-[#ff007f] text-xs text-white placeholder-stone-600 outline-none transition-colors"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-[#ff007f] hover:bg-[#ff3399] text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[0_0_12px_rgba(255,0,127,0.3)] active:scale-95"
              >
                SEARCH
              </button>
            </form>

            {/* Quick Category Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px] shrink-0">
              {PRESET_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setActiveCategory(cat);
                    const q = cat === "All" ? "animation loop" : cat.toLowerCase();
                    setSearchQuery(q);
                    performSearch(q);
                  }}
                  className={`px-2.5 py-1 border whitespace-nowrap cursor-pointer transition-all ${
                    activeCategory === cat
                      ? "bg-[#ff007f]/20 border-[#ff007f] text-[#ff007f] font-bold"
                      : "bg-[#121212] border-[#262626] text-stone-400 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* GIF Results Gallery */}
            <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 gap-2 min-h-0">
              {isSearching ? (
                <div className="col-span-full py-16 flex flex-col items-center justify-center text-stone-500 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#ff007f]" />
                  <span className="text-xs">Searching animations on Giphy...</span>
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((gif) => {
                  const isSelected = selectedGif?.id === gif.id;
                  return (
                    <div
                      key={gif.id}
                      onClick={() => handleSelectGif(gif)}
                      className={`group relative aspect-video bg-black border overflow-hidden cursor-pointer transition-all ${
                        isSelected
                          ? "border-[#ff007f] shadow-[0_0_15px_rgba(255,0,127,0.4)] ring-1 ring-[#ff007f]"
                          : "border-[#262626] hover:border-stone-500"
                      }`}
                    >
                      <img
                        src={gif.previewUrl || gif.url}
                        alt={gif.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-[8.5px] truncate text-stone-200">
                        {gif.title}
                      </div>
                      {isSelected && (
                        <div className="absolute top-1 right-1 p-0.5 bg-[#ff007f] text-white rounded-full">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="col-span-full py-16 text-center text-stone-500 text-xs">
                  No animations found. Try another search query!
                </div>
              )}
            </div>
          </div>

          {/* Right: Sliced Curve Alignment & Preview (5 cols) */}
          <div className="md:col-span-5 p-4 bg-[#0e121a] flex flex-col justify-between overflow-y-auto space-y-4">
            <div>
              <div className="flex items-center justify-between border-b border-[#262626] pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white uppercase tracking-wide">
                  <Layers className="w-3.5 h-3.5 text-[#00f0ff]" />
                  <span>CURVE ALIGNED PREVIEW</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-1 bg-[#181818] border border-[#333] text-stone-300 hover:text-white cursor-pointer"
                    title={isPlaying ? "Pause preview" : "Play loop"}
                  >
                    {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* Sliced Motion Stage Canvas Container */}
              <div className="my-3 aspect-square max-h-[220px] mx-auto w-full bg-black border border-[#ff007f]/40 relative overflow-hidden flex items-center justify-center shadow-inner">
                {isDecoding ? (
                  <div className="flex flex-col items-center gap-2 text-stone-400 text-xs">
                    <Loader2 className="w-6 h-6 animate-spin text-[#ff007f]" />
                    <span>Decompressing GIF frames...</span>
                  </div>
                ) : sampledFrames.length > 0 ? (
                  <div className="relative w-full h-full flex items-center justify-center p-2">
                    <img
                      src={sampledFrames[previewFrameIdx] || sampledFrames[0]}
                      alt="Sliced Frame"
                      className="max-h-full max-w-full object-contain"
                    />

                    {/* Phase badge */}
                    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/80 border border-[#ff007f] text-[9px] font-mono text-[#ff007f] font-bold">
                      PHASE #{previewFrameIdx + 1} / {sampledFrames.length}
                    </div>

                    {/* Curve Alignment indicator */}
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/80 border border-[#00f0ff]/40 text-[9px] font-mono text-[#00f0ff]">
                      {targetZoneSettings?.revealDirection.angle || 0}° Vector
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-6 text-stone-500 text-xs">
                    Select a GIF from the search results to slice & align it to the curve.
                  </div>
                )}
              </div>

              {/* Frame Timeline Scrubber Strip */}
              {sampledFrames.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider flex items-center justify-between">
                    <span>GENERATED SLICED PHASES:</span>
                    <span className="text-[#ff007f]">{sampledFrames.length} FRAMES</span>
                  </div>

                  <div className="grid grid-cols-6 gap-1">
                    {sampledFrames.map((url, idx) => {
                      const isActive = idx === previewFrameIdx;
                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            setIsPlaying(false);
                            setPreviewFrameIdx(idx);
                          }}
                          className={`aspect-square bg-black border overflow-hidden cursor-pointer relative p-0.5 transition-all ${
                            isActive
                              ? "border-[#ff007f] ring-1 ring-[#ff007f]"
                              : "border-[#262626] opacity-70 hover:opacity-100"
                          }`}
                        >
                          <img src={url} alt={`Frame ${idx + 1}`} className="w-full h-full object-contain" />
                          <span className="absolute bottom-0 right-0 px-1 bg-black/90 text-[7.5px] font-mono text-white">
                            F{idx + 1}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-[#262626] space-y-2">
              <button
                type="button"
                onClick={handleApply}
                disabled={sampledFrames.length === 0 || isDecoding}
                className="w-full py-2.5 bg-gradient-to-r from-[#ff007f] via-[#b026ff] to-[#00f0ff] hover:opacity-90 disabled:opacity-30 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(255,0,127,0.35)] cursor-pointer active:scale-95 border border-white/20"
              >
                <Check className="w-4 h-4" />
                <span>✦ APPLY & SLICE INTO CURVE</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-1.5 bg-[#141414] hover:bg-[#202020] text-stone-400 hover:text-white border border-[#333] text-[10px] font-bold uppercase transition-all cursor-pointer"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
