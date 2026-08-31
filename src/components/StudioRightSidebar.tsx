/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import {
  Paintbrush,
  Eraser,
  Move,
  Undo2,
  Redo2,
  Trash2,
  Copy,
  Layers,
  Sparkles,
  Search,
  Upload,
  Image as ImageIcon,
  Check,
  RefreshCw,
  Film,
  Scissors,
  Loader2,
  Sliders,
  Maximize2,
  CopyCheck,
  X,
  FolderPlus,
  Compass,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ZoneSettings, ZoneArtwork, ImageTransform } from "../types";
import { ARCHETYPE_DATABASE, CreatureMotionArchetype, MotionAnalysisResult } from "../utils/motionSuggester";
import { decodeGifFromUrl, resampleGifFrames } from "../utils/gifDecoder";
import { getCustomGifs } from "../utils/customGifStorage";

interface StudioRightSidebarProps {
  // Drawing tool state
  currentTool: "brush" | "eraser" | "pan" | "transform";
  onSelectTool: (tool: "brush" | "eraser" | "pan" | "transform") => void;
  brushColor: string;
  onChangeBrushColor: (color: string) => void;
  brushSize: number;
  onChangeBrushSize: (size: number) => void;
  onionSkinning: boolean;
  onToggleOnionSkinning: () => void;
  onionOpacity: number;
  onChangeOnionOpacity: (opacity: number) => void;
  clipToContour: boolean;
  onToggleClipToContour: () => void;

  // History & Frame actions
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClearFrame: () => void;
  onClearAllFrames?: () => void;
  onQuickCopyAll: () => void;
  onOpenCopyModal: () => void;

  // Zone & Frame context
  targetZoneSettings: ZoneSettings | null;
  activeFrameIndex: number;
  totalFrames: number;
  currentZoneArtwork?: ZoneArtwork;

  // Active Frame Image & Transform State
  activeFrameImageDataUrl?: string;
  imageTransform?: ImageTransform;
  onChangeImageTransform?: (transform: ImageTransform, applyToAll?: boolean) => void;
  onFitImageToCurve?: () => void;
  onFillImageToCurve?: () => void;
  onResetImageTransform?: () => void;
  onRemoveFrameImage?: (fromAll?: boolean) => void;
  syncTransformToAll?: boolean;
  onToggleSyncTransformToAll?: () => void;
  onScaleRightDelta?: (deltaPercent: number) => void;

  // AI Motion recommendation
  motionAnalysis: MotionAnalysisResult | null;
  onOpenMotionAdvisorModal: () => void;

  // GIF / Media actions
  onApplyGifFrames: (frameDataUrls: string[]) => void;
  onOpenFullGifTrimmerModal: () => void;
  onOpenFullGiphyModal: () => void;
  onOpenUploadGifModal?: () => void;
  onTriggerImageUpload: () => void;
  showStatus?: (text: string, type?: "success" | "error" | "info") => void;
}

// Built-in curated high-contrast animation options derived from the Archetype Database
const CURATED_GIFS = ARCHETYPE_DATABASE.map((a) => ({
  id: a.id,
  title: a.gifTitle || a.name,
  category: a.category.charAt(0).toUpperCase() + a.category.slice(1),
  rawCategory: a.category,
  url: a.gifUrl || a.gifPreviewUrl || "",
  previewUrl: a.gifPreviewUrl || a.gifUrl || "",
  contrastLevel: a.contrastLevel,
  tags: a.tags,
}));

const CATEGORIES = [
  "All",
  "B&W Silhouettes",
  "Quadruped",
  "Birds",
  "Aquatic",
  "Humanoid",
  "Mechanical",
  "Celestial",
  "Serpentine",
  "Organic",
  "My Uploads",
];

const CYBER_COLORS = [
  { name: "Cyan", hex: "#00f0ff" },
  { name: "Pink", hex: "#ff007f" },
  { name: "Red", hex: "#ff0000" },
  { name: "Yellow", hex: "#ffe600" },
  { name: "Green", hex: "#00ff66" },
  { name: "Purple", hex: "#b026ff" },
  { name: "White", hex: "#ffffff" },
  { name: "Charcoal", hex: "#1e293b" },
];

export function StudioRightSidebar({
  currentTool,
  onSelectTool,
  brushColor,
  onChangeBrushColor,
  brushSize,
  onChangeBrushSize,
  onionSkinning,
  onToggleOnionSkinning,
  onionOpacity,
  onChangeOnionOpacity,
  clipToContour,
  onToggleClipToContour,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClearFrame,
  onClearAllFrames,
  onQuickCopyAll,
  onOpenCopyModal,
  targetZoneSettings,
  activeFrameIndex,
  totalFrames,
  currentZoneArtwork,
  activeFrameImageDataUrl,
  imageTransform = { x: 0, y: 0, scale: 1, rotation: 0 },
  onChangeImageTransform,
  onFitImageToCurve,
  onFillImageToCurve,
  onResetImageTransform,
  onRemoveFrameImage,
  syncTransformToAll = true,
  onToggleSyncTransformToAll,
  onScaleRightDelta,
  motionAnalysis,
  onOpenMotionAdvisorModal,
  onApplyGifFrames,
  onOpenFullGifTrimmerModal,
  onOpenFullGiphyModal,
  onOpenUploadGifModal,
  onTriggerImageUpload,
  showStatus,
}: StudioRightSidebarProps) {
  const [activeTab, setActiveTab] = useState<"tools" | "giphy">("tools");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [slicingGifId, setSlicingGifId] = useState<string | null>(null);
  const [isGumballExpanded, setIsGumballExpanded] = useState<boolean>(false);
  const [isMotionExpanded, setIsMotionExpanded] = useState<boolean>(false);

  const frameCount = targetZoneSettings?.frameCount || totalFrames || 6;
  const hasActiveImage = !!activeFrameImageDataUrl;
  const framesWithImageCount = currentZoneArtwork?.frames.filter((f) => !!f.imageDataUrl).length || 0;

  // Combine curated archetypes and custom uploaded GIFs
  const allLibraryItems = useMemo(() => {
    const customGifs = getCustomGifs();
    const customMapped = customGifs.map((cg) => ({
      id: cg.id,
      title: cg.title,
      category: cg.categoryLabel || "Custom",
      rawCategory: cg.category,
      url: cg.url || cg.previewUrl,
      previewUrl: cg.previewUrl || cg.url,
      contrastLevel: cg.contrastLevel,
      tags: cg.tags,
      isCustom: true,
      frames: cg.frames,
    }));
    return [...customMapped, ...CURATED_GIFS];
  }, [activeTab]);

  const [searchResults, setSearchResults] = useState(allLibraryItems);

  // Search pre-pulled high-contrast library + Giphy API fallback
  const handleSearch = async (queryText: string) => {
    const qLower = queryText.toLowerCase().trim();
    if (!qLower) {
      filterByCategory(selectedCategory);
      return;
    }

    // 1. Instant local search across curated database and custom uploads
    const localMatches = allLibraryItems.filter(
      (g) =>
        g.title.toLowerCase().includes(qLower) ||
        g.category.toLowerCase().includes(qLower) ||
        g.rawCategory?.toLowerCase().includes(qLower) ||
        g.tags?.some((t) => t.toLowerCase().includes(qLower))
    );

    if (localMatches.length > 0) {
      setSearchResults(localMatches);
    }

    // 2. Query Giphy with high-contrast search terms
    setIsSearching(true);
    try {
      const enhancedQuery = `${qLower} silhouette loop`;
      const endpoint = `https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(
        enhancedQuery
      )}&limit=12&rating=g`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data.length > 0) {
          const onlineItems = json.data.map((item: any) => ({
            id: item.id,
            title: item.title || queryText,
            category: "Giphy",
            rawCategory: "online",
            url: item.images?.original?.url || item.images?.downsized?.url,
            previewUrl:
              item.images?.fixed_height_small?.url ||
              item.images?.preview_gif?.url ||
              item.images?.fixed_width?.url,
            contrastLevel: "high" as const,
            tags: [qLower],
          }));

          // Merge local curated matches at the front + online results
          const combined = [...localMatches, ...onlineItems.filter((o: any) => !localMatches.some((l) => l.id === o.id))];
          setSearchResults(combined);
          setIsSearching(false);
          return;
        }
      }
    } catch (e) {
      console.warn("Giphy API search fallback:", e);
    }

    setSearchResults(localMatches.length > 0 ? localMatches : allLibraryItems);
    setIsSearching(false);
  };

  const filterByCategory = (cat: string) => {
    setSelectedCategory(cat);
    setSearchQuery("");
    const catLower = cat.toLowerCase();

    if (cat === "All") {
      setSearchResults(allLibraryItems);
    } else if (cat === "B&W Silhouettes" || cat === "High-Contrast") {
      setSearchResults(allLibraryItems.filter((g) => g.contrastLevel === "ultra" || g.tags?.includes("bw")));
    } else if (cat === "My Uploads") {
      setSearchResults(allLibraryItems.filter((g: any) => g.isCustom));
    } else {
      setSearchResults(
        allLibraryItems.filter(
          (g) =>
            g.category.toLowerCase().includes(catLower) ||
            g.rawCategory?.toLowerCase().includes(catLower) ||
            g.tags?.some((t) => t.toLowerCase() === catLower)
        )
      );
    }
  };

  const handleCategoryClick = (cat: string) => {
    filterByCategory(cat);
  };

  // Direct 1-Click Slice & Apply GIF into target curve
  const handleDirectSliceGif = async (gifItem: { id: string; url: string; title: string; frames?: string[] }) => {
    setSlicingGifId(gifItem.id);
    showStatus?.(`Applying GIF into ${frameCount} phases...`, "info");

    try {
      if (gifItem.frames && gifItem.frames.length > 0) {
        // Pre-decoded custom frames
        const sampled = resampleGifFrames(gifItem.frames, frameCount, [0, gifItem.frames.length - 1]);
        onApplyGifFrames(sampled);
        showStatus?.(`Applied ${sampled.length} frames from "${gifItem.title}"!`, "success");
      } else {
        const decoded = await decodeGifFromUrl(gifItem.url);
        const allUrls = decoded.frames.map((f) => f.dataUrl);
        const sampled = resampleGifFrames(allUrls, frameCount, [0, decoded.frames.length - 1]);
        onApplyGifFrames(sampled);
        showStatus?.(`Successfully sliced ${sampled.length} frames from "${gifItem.title}"!`, "success");
      }
    } catch (err: any) {
      console.warn("Direct slice error handled:", err);
      showStatus?.(err.message || "Failed to slice GIF.", "error");
    } finally {
      setSlicingGifId(null);
    }
  };

  return (
    <aside className="w-80 bg-[#0c0c0c] border-l border-[#262626] flex flex-col font-mono select-none overflow-hidden shrink-0 z-30">
      {/* Top Sidebar Header Tabs */}
      <div className="flex border-b border-[#262626] bg-black">
        <button
          onClick={() => setActiveTab("tools")}
          className={`flex-1 py-2.5 text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === "tools"
              ? "bg-[#141414] text-[#00f0ff] border-b-2 border-[#00f0ff]"
              : "text-stone-400 hover:text-stone-200"
          }`}
        >
          <Paintbrush className="w-3.5 h-3.5" />
          <span>DRAWING TOOLS</span>
        </button>

        <button
          onClick={() => setActiveTab("giphy")}
          className={`flex-1 py-2.5 text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === "giphy"
              ? "bg-[#141414] text-[#ff007f] border-b-2 border-[#ff007f]"
              : "text-stone-400 hover:text-stone-200"
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          <span>GIF FINDER</span>
        </button>
      </div>

      {/* Main Content Body */}
      <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-4">
        {activeTab === "tools" ? (
          /* =========================================================
             TAB 1: DRAWING TOOLS & ON-SCREEN GUMBALL GIZMO STATUS
             ========================================================= */
          <div className="flex flex-col gap-4">
            {/* Primary Tool Selector Buttons */}
            <div className="grid grid-cols-4 gap-1.5 bg-black/60 p-1.5 border border-[#262626] rounded">
              <button
                onClick={() => onSelectTool("brush")}
                className={`py-2 flex flex-col items-center gap-1 text-[10px] font-bold uppercase transition-all cursor-pointer ${
                  currentTool === "brush"
                    ? "bg-[#00f0ff] text-black shadow-[0_0_10px_rgba(0,240,255,0.4)]"
                    : "bg-[#141414] text-stone-400 hover:text-stone-200"
                }`}
              >
                <Paintbrush className="w-4 h-4" />
                <span>BRUSH</span>
              </button>

              <button
                onClick={() => onSelectTool("eraser")}
                className={`py-2 flex flex-col items-center gap-1 text-[10px] font-bold uppercase transition-all cursor-pointer ${
                  currentTool === "eraser"
                    ? "bg-[#ff007f] text-white shadow-[0_0_10px_rgba(255,0,127,0.4)]"
                    : "bg-[#141414] text-stone-400 hover:text-stone-200"
                }`}
              >
                <Eraser className="w-4 h-4" />
                <span>ERASER</span>
              </button>

              <button
                onClick={() => onSelectTool("transform")}
                className={`py-2 flex flex-col items-center gap-1 text-[10px] font-bold uppercase transition-all cursor-pointer ${
                  currentTool === "transform"
                    ? "bg-[#ffe600] text-black shadow-[0_0_10px_rgba(255,230,0,0.4)]"
                    : "bg-[#141414] text-stone-400 hover:text-stone-200"
                }`}
                title="Select GIF or Image on canvas to activate the interactive 2D Gumball Gizmo"
              >
                <Move className="w-4 h-4" />
                <span>GUMBALL</span>
              </button>

              <button
                onClick={() => onSelectTool("pan")}
                className={`py-2 flex flex-col items-center gap-1 text-[10px] font-bold uppercase transition-all cursor-pointer ${
                  currentTool === "pan"
                    ? "bg-[#00ff66] text-black shadow-[0_0_10px_rgba(0,255,102,0.4)]"
                    : "bg-[#141414] text-stone-400 hover:text-stone-200"
                }`}
                title="Pan canvas (or hold Spacebar)"
              >
                <Compass className="w-4 h-4" />
                <span>PAN</span>
              </button>
            </div>

            {/* =========================================================
                ON-SCREEN GUMBALL GIZMO CONTROL PANEL
                (Collapsible - collapsed by default to maximize canvas focus)
                ========================================================= */}
            {(hasActiveImage || currentTool === "transform") && (
              <div className="border border-[#ffe600]/40 rounded bg-[#121210] overflow-hidden transition-all shadow-[0_0_12px_rgba(255,230,0,0.08)]">
                {/* Collapsible Header Banner */}
                <button
                  type="button"
                  onClick={() => setIsGumballExpanded(!isGumballExpanded)}
                  className="w-full p-2.5 flex items-center justify-between hover:bg-[#1a1a14] transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2">
                    <Move className="w-3.5 h-3.5 text-[#ffe600]" />
                    <span className="text-[10px] font-black text-[#ffe600] uppercase tracking-wider">
                      GUMBALL GIZMO
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] bg-[#ffe600]/20 text-[#ffe600] px-1.5 py-0.5 border border-[#ffe600]/30 font-mono font-bold">
                      {Math.round((imageTransform.scale || 1) * 100)}% SCALE
                    </span>
                    {isGumballExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-[#ffe600]" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Content Details & Controls */}
                {isGumballExpanded && (
                  <div className="p-3 pt-2 border-t border-[#262626] bg-gradient-to-b from-[#ffe600]/10 to-black/90 flex flex-col gap-2.5">
                    {activeFrameImageDataUrl && (
                      <div className="flex items-center justify-between pb-1 border-b border-[#222]">
                        <span className="text-[9px] text-stone-400 font-bold uppercase">Active Target Frame:</span>
                        <div className="w-7 h-7 rounded border border-[#ffe600]/80 overflow-hidden bg-black flex items-center justify-center">
                          <img
                            src={activeFrameImageDataUrl}
                            alt="GIF thumbnail"
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                      </div>
                    )}

                    {/* Direct On-Screen Manipulation Info Badge */}
                    <div className="p-2 bg-black/60 border border-[#333] text-[9.5px] text-stone-300 flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[#ffe600] font-bold">
                        <span>STATUS: INTERACTIVE ON CANVAS</span>
                        <span>{Math.round((imageTransform.scale || 1) * 100)}% SCALE</span>
                      </div>
                      <div className="flex items-center justify-between text-stone-400 text-[8.5px] font-mono">
                        <span>
                          OFFSET: ({Math.round(imageTransform.x || 0)}px, {Math.round(imageTransform.y || 0)}px)
                        </span>
                        <span>ROTATION: {Math.round(imageTransform.rotation || 0)}°</span>
                      </div>
                      <p className="text-[8.5px] text-stone-400 font-sans leading-tight pt-1 border-t border-[#222]">
                        Drag the on-screen gizmo on canvas to reposition, drag blue/yellow corner handles to scale, and drag the orange top knob to rotate.
                      </p>
                    </div>

                    {/* Scale Right (Width) Dedicated Controls */}
                    <div className="p-2 bg-gradient-to-r from-[#00f0ff]/10 to-black/80 border border-[#00f0ff]/40 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-[#00f0ff] uppercase flex items-center gap-1">
                          <Maximize2 className="w-3 h-3 text-[#00f0ff]" />
                          SCALE RIGHT ONLY (WIDTH)
                        </span>
                        <span className="text-[9px] font-mono text-[#00f0ff] font-bold">
                          {Math.round((imageTransform.scaleX !== undefined ? imageTransform.scaleX : 1) * 100)}%
                        </span>
                      </div>
                      <p className="text-[8.5px] text-stone-300 leading-tight">
                        Expands the right edge outward while keeping the left edge anchored in place.
                      </p>

                      {/* Quick 1-Click Buttons */}
                      <div className="grid grid-cols-3 gap-1">
                        <button
                          type="button"
                          onClick={() => onScaleRightDelta?.(-0.1)}
                          className="py-1 px-1 bg-[#111] hover:bg-[#222] text-[#00f0ff] hover:text-white border border-[#00f0ff]/30 text-[9px] font-bold uppercase transition-all cursor-pointer text-center"
                          title="Shrink width to the right by 10%"
                        >
                          ← -10% RIGHT
                        </button>
                        <button
                          type="button"
                          onClick={() => onScaleRightDelta?.(0.1)}
                          className="py-1 px-1 bg-[#00f0ff]/20 hover:bg-[#00f0ff]/30 text-[#00f0ff] hover:text-white border border-[#00f0ff]/60 text-[9px] font-black uppercase transition-all cursor-pointer text-center shadow-[0_0_8px_rgba(0,240,255,0.2)]"
                          title="Expand width to the right by 10% (Left edge fixed)"
                        >
                          → +10% RIGHT
                        </button>
                        <button
                          type="button"
                          onClick={() => onScaleRightDelta?.(0.25)}
                          className="py-1 px-1 bg-[#00f0ff]/20 hover:bg-[#00f0ff]/30 text-[#00f0ff] hover:text-white border border-[#00f0ff]/60 text-[9px] font-black uppercase transition-all cursor-pointer text-center"
                          title="Expand width to the right by 25%"
                        >
                          +25% RIGHT
                        </button>
                      </div>

                      {/* Width Scale X Slider */}
                      <div className="flex flex-col gap-1 pt-1 border-t border-[#00f0ff]/20">
                        <div className="flex items-center justify-between text-[8.5px] text-stone-400 font-mono">
                          <span>WIDTH STRETCH (X):</span>
                          <span>{Math.round((imageTransform.scaleX !== undefined ? imageTransform.scaleX : 1) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="20"
                          max="400"
                          step="5"
                          value={Math.round((imageTransform.scaleX !== undefined ? imageTransform.scaleX : 1) * 100)}
                          onChange={(e) => {
                            const newPct = parseFloat(e.target.value) / 100;
                            const curScaleX = imageTransform.scaleX !== undefined ? imageTransform.scaleX : 1.0;
                            const delta = newPct - curScaleX;
                            onScaleRightDelta?.(delta);
                          }}
                          className="w-full accent-[#00f0ff] h-1.5 bg-[#1e293b] rounded cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                      <button
                        onClick={onFitImageToCurve}
                        className="py-1.5 px-2 bg-[#ffe600]/20 hover:bg-[#ffe600]/30 text-[9.5px] font-bold text-[#ffe600] border border-[#ffe600]/40 uppercase flex items-center justify-center gap-1 cursor-pointer transition-all"
                        title="Scale GIF to fit precisely inside curve bounds"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>FIT TO CURVE</span>
                      </button>

                      <button
                        onClick={onFillImageToCurve}
                        className="py-1.5 px-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[9.5px] font-bold text-stone-300 border border-[#333] uppercase flex items-center justify-center gap-1 cursor-pointer transition-all"
                        title="Scale GIF to fill entire curve area"
                      >
                        <Sliders className="w-3 h-3 text-[#00ff66]" />
                        <span>FILL BOUNDS</span>
                      </button>

                      <button
                        onClick={onResetImageTransform}
                        className="py-1.5 px-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[9.5px] font-bold text-stone-300 border border-[#333] uppercase flex items-center justify-center gap-1 cursor-pointer transition-all"
                        title="Reset offset to 0,0, scale to 100%, and rotation to 0°"
                      >
                        <RefreshCw className="w-3 h-3 text-[#00f0ff]" />
                        <span>RESET (0,0)</span>
                      </button>

                      {onRemoveFrameImage && hasActiveImage && (
                        <button
                          onClick={() => onRemoveFrameImage(syncTransformToAll)}
                          className="py-1.5 px-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 text-[9.5px] font-bold border border-red-800/50 uppercase flex items-center justify-center gap-1 cursor-pointer transition-all"
                          title="Remove image from frame"
                        >
                          <X className="w-3 h-3" />
                          <span>REMOVE GIF</span>
                        </button>
                      )}
                    </div>

                    {/* Sync to all frames checkbox */}
                    {onToggleSyncTransformToAll && (
                      <label className="flex items-center gap-2 text-[9px] text-stone-300 cursor-pointer pt-1 border-t border-[#222]">
                        <input
                          type="checkbox"
                          checked={syncTransformToAll}
                          onChange={onToggleSyncTransformToAll}
                          className="accent-[#ffe600]"
                        />
                        <span>Apply transform to all {totalFrames} sequence frames</span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Stroke Color Palette */}
            {currentTool === "brush" && (
              <div className="flex flex-col gap-2 p-3 bg-black/60 border border-[#262626] rounded">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                    STROKE COLOR
                  </label>
                  <span className="text-[10px] font-bold" style={{ color: brushColor }}>
                    {brushColor.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {CYBER_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      onClick={() => onChangeBrushColor(c.hex)}
                      className={`h-7 border transition-all cursor-pointer flex items-center justify-center relative ${
                        brushColor.toLowerCase() === c.hex.toLowerCase()
                          ? "border-white ring-2 ring-white z-10 scale-105"
                          : "border-[#333] opacity-80 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    >
                      {brushColor.toLowerCase() === c.hex.toLowerCase() && (
                        <Check className="w-3.5 h-3.5 text-black filter drop-shadow" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#262626]">
                  <span className="text-[9px] text-stone-400 uppercase">CUSTOM:</span>
                  <input
                    type="color"
                    value={brushColor}
                    onChange={(e) => onChangeBrushColor(e.target.value)}
                    className="w-full h-7 bg-[#111] border border-[#333] cursor-pointer rounded-none p-0.5"
                  />
                </div>
              </div>
            )}

            {/* Brush Size */}
            {currentTool === "brush" || currentTool === "eraser" ? (
              <div className="flex flex-col gap-2 p-3 bg-black/60 border border-[#262626] rounded">
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-stone-400 uppercase tracking-wider">BRUSH SIZE</span>
                  <span className="text-[#00f0ff]">{brushSize}px</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="40"
                  value={brushSize}
                  onChange={(e) => onChangeBrushSize(parseInt(e.target.value, 10))}
                  className="w-full accent-[#00f0ff] cursor-pointer h-2 bg-[#1a1a1a] rounded appearance-none"
                />
              </div>
            ) : null}

            {/* Onion Skinning & Curve Masking Settings */}
            <div className="flex flex-col gap-2 p-3 bg-black/60 border border-[#262626] rounded">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                VIEWPORT & MASKING
              </label>

              {/* Onion Skinning Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#ff007f]" />
                  <span>Onion Skinning</span>
                </span>
                <button
                  onClick={onToggleOnionSkinning}
                  className={`p-1 px-2 text-[10px] font-bold border transition-all cursor-pointer ${
                    onionSkinning
                      ? "bg-[#ff007f]/20 border-[#ff007f] text-[#ff007f]"
                      : "bg-[#141414] border-[#333] text-stone-500"
                  }`}
                >
                  {onionSkinning ? "ON" : "OFF"}
                </button>
              </div>

              {onionSkinning && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[9px] text-stone-500">Opacity:</span>
                  <input
                    type="range"
                    min="0.05"
                    max="0.8"
                    step="0.05"
                    value={onionOpacity}
                    onChange={(e) => onChangeOnionOpacity(parseFloat(e.target.value))}
                    className="w-full accent-[#ff007f] cursor-pointer h-1.5 bg-[#1a1a1a] rounded appearance-none"
                  />
                  <span className="text-[9px] text-[#ff007f] font-mono w-6 text-right">
                    {Math.round(onionOpacity * 100)}%
                  </span>
                </div>
              )}

              {/* Mask to Curve Outline */}
              <div className="flex items-center justify-between mt-1 pt-2 border-t border-[#262626]">
                <span className="text-xs text-stone-300 flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 text-[#00f0ff]" />
                  <span>Mask to Curve</span>
                </span>
                <button
                  onClick={onToggleClipToContour}
                  className={`p-1 px-2 text-[10px] font-bold border transition-all cursor-pointer ${
                    clipToContour
                      ? "bg-[#00f0ff]/20 border-[#00f0ff] text-[#00f0ff]"
                      : "bg-[#141414] border-[#333] text-stone-500"
                  }`}
                >
                  {clipToContour ? "MASKED" : "UNMASKED"}
                </button>
              </div>
            </div>

            {/* Frame History & Quick Copy Utilities */}
            <div className="flex flex-col gap-2 p-3 bg-black/60 border border-[#262626] rounded">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                FRAME UTILITIES
              </label>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="p-1.5 bg-[#141414] hover:bg-[#202020] disabled:opacity-40 border border-[#333] text-stone-300 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                  title="Undo last stroke"
                >
                  <Undo2 className="w-3.5 h-3.5 text-[#00f0ff]" />
                  <span>UNDO</span>
                </button>

                <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="p-1.5 bg-[#141414] hover:bg-[#202020] disabled:opacity-40 border border-[#333] text-stone-300 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                  title="Redo stroke"
                >
                  <Redo2 className="w-3.5 h-3.5 text-[#00f0ff]" />
                  <span>REDO</span>
                </button>

                <button
                  onClick={onClearFrame}
                  className="p-1.5 bg-[#141414] hover:bg-red-950/40 border border-[#333] hover:border-red-500 text-stone-300 hover:text-red-400 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                  title={`Clear Frame #${activeFrameIndex + 1} artwork and image`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  <span>CLEAR F#{activeFrameIndex + 1}</span>
                </button>
              </div>

              {onClearAllFrames && (
                <button
                  onClick={onClearAllFrames}
                  className="p-1.5 bg-red-950/20 hover:bg-red-950/50 border border-red-900/40 hover:border-red-500 text-red-400 text-[10px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  title="Remove everything from all layers, frames, GIFs, and drawings across this entire curve"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  <span>CLEAR ALL FRAMES, GIFS & DRAWINGS</span>
                </button>
              )}

              <div className="flex flex-col gap-1.5 mt-1 pt-2 border-t border-[#262626]">
                <button
                  onClick={onQuickCopyAll}
                  className="p-2 bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 border border-[#00f0ff]/40 hover:border-[#00f0ff] text-[#00f0ff] text-[10.5px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  title="Copy current frame artwork across all sequence phases"
                >
                  <CopyCheck className="w-3.5 h-3.5" />
                  <span>COPY F#{activeFrameIndex + 1} TO ALL FRAMES</span>
                </button>

                <button
                  onClick={onOpenCopyModal}
                  className="p-1.5 bg-[#141414] hover:bg-[#202020] border border-[#333] hover:border-stone-400 text-stone-300 text-[10px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  title="Custom frame copy manager"
                >
                  <Copy className="w-3 h-3 text-stone-400" />
                  <span>CUSTOM FRAME COPY...</span>
                </button>
              </div>
            </div>

            {/* AI Creature Motion Advisor Recommendation Card with Live Animated GIF Preview (Collapsible) */}
            {motionAnalysis && (
              <div className="border border-[#00f0ff]/30 rounded bg-[#101314] overflow-hidden transition-all shadow-[0_0_12px_rgba(0,240,255,0.08)]">
                {/* Collapsible Header */}
                <button
                  type="button"
                  onClick={() => setIsMotionExpanded(!isMotionExpanded)}
                  className="w-full p-2.5 flex items-center justify-between hover:bg-[#151c1e] transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#ff007f] animate-pulse" />
                    <span className="text-[10px] font-bold text-[#00f0ff] uppercase tracking-wider">
                      RECOMMENDED MOTION
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] bg-[#00f0ff]/20 text-[#00f0ff] px-1.5 py-0.5 border border-[#00f0ff]/40 font-black">
                      {motionAnalysis.primaryRecommendation.suitabilityScore}% MATCH
                    </span>
                    {isMotionExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-[#00f0ff]" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Details & 1-Click Slicer */}
                {isMotionExpanded && (
                  <div className="p-3 pt-2 border-t border-[#262626] bg-gradient-to-br from-[#00f0ff]/10 to-[#ff007f]/10 flex flex-col gap-2">
                    {/* Animated GIF Preview Badge */}
                    {motionAnalysis.primaryRecommendation.gifPreviewUrl && (
                      <div className="relative aspect-video w-full bg-black border border-[#00f0ff]/50 rounded overflow-hidden flex items-center justify-center group/rec">
                        <img
                          src={motionAnalysis.primaryRecommendation.gifPreviewUrl}
                          alt={motionAnalysis.primaryRecommendation.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-1 left-1 bg-black/80 px-1.5 py-0.5 text-[8px] text-[#00f0ff] font-bold border border-[#00f0ff]/40">
                          RECOMMENDED ANIMATION
                        </div>
                        <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 text-[8px] text-[#ff007f] font-mono">
                          {motionAnalysis.primaryRecommendation.gifTitle || motionAnalysis.primaryRecommendation.name}
                        </div>
                      </div>
                    )}

                    <div className="text-xs font-bold text-white uppercase">
                      {motionAnalysis.primaryRecommendation.name}
                    </div>
                    <p className="text-[10px] text-stone-400 leading-tight">
                      {motionAnalysis.primaryRecommendation.summary}
                    </p>

                    {/* Quick 1-Click Slice Recommended GIF Button */}
                    {motionAnalysis.primaryRecommendation.gifUrl && (
                      <button
                        onClick={() =>
                          handleDirectSliceGif({
                            id: motionAnalysis.primaryRecommendation.id,
                            url: motionAnalysis.primaryRecommendation.gifUrl!,
                            title: motionAnalysis.primaryRecommendation.gifTitle || motionAnalysis.primaryRecommendation.name,
                          })
                        }
                        className="p-2 bg-[#ff007f] hover:bg-[#e0006f] text-white text-[10px] font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow-lg transition-all"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                        <span>SLICE & APPLY RECOMMENDED GIF ({frameCount}F)</span>
                      </button>
                    )}

                    <button
                      onClick={onOpenMotionAdvisorModal}
                      className="p-1.5 bg-[#00f0ff]/20 hover:bg-[#00f0ff]/30 text-[#00f0ff] border border-[#00f0ff]/50 text-[10px] font-bold uppercase flex items-center justify-center gap-1 cursor-pointer transition-all"
                    >
                      <span>CHOREOGRAPHY BLUEPRINT →</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* =========================================================
             TAB 2: GIF FINDER & CATEGORY BROWSER + CUSTOM UPLOADER
             ========================================================= */
          <div className="flex flex-col gap-3.5">
            {/* Upload GIF & Select Category Banner */}
            {onOpenUploadGifModal && (
              <button
                onClick={onOpenUploadGifModal}
                className="w-full p-2.5 bg-gradient-to-r from-[#ff007f]/30 to-[#00f0ff]/30 hover:from-[#ff007f]/50 hover:to-[#00f0ff]/50 border border-[#ff007f] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(255,0,127,0.3)] transition-all active:scale-95"
              >
                <FolderPlus className="w-4 h-4 text-[#00f0ff]" />
                <span>UPLOAD GIF & SELECT CATEGORY</span>
              </button>
            )}

            {/* Active GIF Banner (if loaded) */}
            {framesWithImageCount > 0 && (
              <div className="p-2.5 bg-[#ffe600]/10 border border-[#ffe600]/50 rounded flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-black border border-[#ffe600] overflow-hidden shrink-0 flex items-center justify-center">
                    {activeFrameImageDataUrl ? (
                      <img
                        src={activeFrameImageDataUrl}
                        alt="Active frame"
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <Film className="w-4 h-4 text-[#ffe600]" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-[#ffe600]">ACTIVE GIF ATTACHED</span>
                    <span className="text-[8.5px] text-stone-400">
                      {framesWithImageCount} of {frameCount} phases populated
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setActiveTab("tools");
                    onSelectTool("transform");
                  }}
                  className="px-2 py-1 bg-[#ffe600] hover:bg-[#e6cf00] text-black text-[9px] font-black uppercase flex items-center gap-1 cursor-pointer"
                >
                  <Move className="w-3 h-3" />
                  <span>GUMBALL</span>
                </button>
              </div>
            )}

            {/* AI Top Recommendation Pinned at Top of GIF Finder */}
            {motionAnalysis?.primaryRecommendation?.gifPreviewUrl && (
              <div className="p-2.5 bg-gradient-to-r from-[#00f0ff]/15 to-[#ff007f]/15 border border-[#00f0ff]/60 rounded flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-[#00f0ff] uppercase flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#ff007f]" />
                    RECOMMENDED FOR THIS CURVE
                  </span>
                  <span className="text-[8.5px] bg-[#00f0ff]/20 text-[#00f0ff] px-1 py-0.5 font-mono">
                    {motionAnalysis.primaryRecommendation.suitabilityScore}% MATCH
                  </span>
                </div>

                <div className="flex gap-2">
                  <div className="w-20 h-16 bg-black border border-[#00f0ff]/50 shrink-0 overflow-hidden relative">
                    <img
                      src={motionAnalysis.primaryRecommendation.gifPreviewUrl}
                      alt={motionAnalysis.primaryRecommendation.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col justify-between flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-white uppercase truncate">
                      {motionAnalysis.primaryRecommendation.gifTitle || motionAnalysis.primaryRecommendation.name}
                    </div>
                    <p className="text-[8.5px] text-stone-400 line-clamp-2">
                      {motionAnalysis.primaryRecommendation.summary}
                    </p>
                    <button
                      onClick={() =>
                        handleDirectSliceGif({
                          id: motionAnalysis.primaryRecommendation.id,
                          url: motionAnalysis.primaryRecommendation.gifUrl!,
                          title: motionAnalysis.primaryRecommendation.gifTitle || motionAnalysis.primaryRecommendation.name,
                        })
                      }
                      className="mt-1 py-1 px-2 bg-[#ff007f] hover:bg-[#e0006f] text-white text-[9px] font-black uppercase flex items-center justify-center gap-1 cursor-pointer shadow"
                    >
                      <Scissors className="w-3 h-3" />
                      <span>SLICE INTO CURVE ({frameCount}F)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Search Input Bar */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                SEARCH GIF LIBRARY
              </label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSearch(searchQuery);
                    }}
                    placeholder="e.g. horse gallop, bird flight, gear spin..."
                    className="w-full bg-[#121212] border border-[#333] focus:border-[#ff007f] text-stone-100 text-xs px-2.5 py-2 pl-7 placeholder-stone-600 focus:outline-none"
                  />
                  <Search className="w-3.5 h-3.5 text-stone-500 absolute left-2 top-2.5" />
                </div>
                <button
                  onClick={() => handleSearch(searchQuery)}
                  disabled={isSearching}
                  className="px-3 bg-[#ff007f] hover:bg-[#e0006f] disabled:opacity-50 text-white text-xs font-bold uppercase transition-all cursor-pointer"
                >
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "SEARCH"}
                </button>
              </div>
            </div>

            {/* Category Filter Chips (Overhauled categories) */}
            <div className="flex flex-wrap gap-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleCategoryClick(cat)}
                  className={`px-2 py-0.5 text-[9px] font-mono uppercase cursor-pointer border transition-all ${
                    selectedCategory === cat
                      ? "bg-[#ff007f]/20 border-[#ff007f] text-[#ff007f] shadow-[0_0_8px_rgba(255,0,127,0.3)]"
                      : "bg-[#141414] border-[#262626] text-stone-400 hover:text-stone-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Animated GIF Results Grid */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10px] text-stone-400">
                <span className="font-bold uppercase tracking-wider">
                  {selectedCategory.toUpperCase()} PRESETS ({searchResults.length}):
                </span>
                <span className="text-[#ff007f] font-mono">{frameCount} FRAMES</span>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
                {searchResults.map((gif: any) => {
                  const isSlicing = slicingGifId === gif.id;
                  return (
                    <div
                      key={gif.id}
                      onClick={() => handleDirectSliceGif(gif)}
                      className="group relative aspect-square bg-black border border-[#262626] hover:border-[#ff007f] overflow-hidden cursor-pointer flex flex-col justify-between p-1 transition-all hover:shadow-[0_0_15px_rgba(255,0,127,0.3)]"
                    >
                      <img
                        src={gif.previewUrl}
                        alt={gif.title}
                        className="w-full h-full object-cover rounded-none transition-transform group-hover:scale-105"
                      />

                      {/* Custom Upload Badge */}
                      {gif.isCustom && (
                        <div className="absolute top-1 left-1 bg-[#00f0ff] text-black text-[7.5px] font-black px-1 py-0.2">
                          MY UPLOAD
                        </div>
                      )}

                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between items-center text-center">
                        <span className="text-[9px] text-white font-bold uppercase truncate w-full">
                          {gif.title}
                        </span>
                        <span className="px-2 py-1 bg-[#ff007f] text-white text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md">
                          <Scissors className="w-3 h-3" />
                          <span>SLICE ({frameCount}F)</span>
                        </span>
                      </div>

                      {/* Loading indicator if actively slicing */}
                      {isSlicing && (
                        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-1 text-[#ff007f]">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="text-[8px] font-bold">SLICING...</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Additional Media Upload Actions */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-[#262626]">
              {onOpenUploadGifModal && (
                <button
                  onClick={onOpenUploadGifModal}
                  className="w-full p-2 bg-[#ff007f]/15 hover:bg-[#ff007f]/25 border border-[#ff007f]/50 text-[#ff007f] text-[10px] font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
                  title="Upload GIF file, specify title, and pick its archetype category"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>UPLOAD GIF & SELECT CATEGORY</span>
                </button>
              )}

              <button
                onClick={onOpenFullGiphyModal}
                className="w-full p-2 bg-gradient-to-r from-[#ff007f]/20 to-[#00f0ff]/20 hover:from-[#ff007f]/30 hover:to-[#00f0ff]/30 border border-[#ff007f]/50 text-[#ff007f] text-[10px] font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
                title="Open full interactive Giphy search and slice modal with trim sliders"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>ADVANCED GIPHY SEARCH MODAL</span>
              </button>

              <button
                onClick={onOpenFullGifTrimmerModal}
                className="w-full p-2 bg-[#141414] hover:bg-[#202020] border border-[#333] hover:border-stone-400 text-stone-300 text-[10px] font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
                title="Upload custom .gif file from your computer and trim frame ranges"
              >
                <Upload className="w-3.5 h-3.5 text-[#00f0ff]" />
                <span>QUICK GIF TRIMMER</span>
              </button>

              <button
                onClick={onTriggerImageUpload}
                className="w-full p-2 bg-[#141414] hover:bg-[#202020] border border-[#333] hover:border-stone-400 text-stone-300 text-[10px] font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
                title="Add custom PNG, JPEG, or SVG image to current frame"
              >
                <ImageIcon className="w-3.5 h-3.5 text-[#00f0ff]" />
                <span>ADD IMAGE / SVG TO FRAME</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
