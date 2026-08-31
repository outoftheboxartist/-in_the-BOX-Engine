/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import {
  Sparkles,
  Wand2,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  ArrowRight,
  Fish,
  Bug,
  RotateCcw,
  Zap,
  Activity,
  Compass,
  Sliders,
  Play,
  Search,
  Grid,
  Filter,
  Scissors,
  Eye,
} from "lucide-react";
import { ZoneSettings } from "../types";
import {
  analyzeShapeGeometry,
  generateMotionRecommendations,
  filterArchetypes,
  CreatureMotionArchetype,
  ShapeMetrics,
} from "../utils/motionSuggester";
import { MotionChoreographyModal } from "./MotionChoreographyModal";

interface MotionAdvisorPanelProps {
  shapeElement: SVGElement | null;
  zoneSettings: ZoneSettings | null;
  onUpdateSettings: (settings: ZoneSettings) => void;
  onOpenArtworkStudio?: () => void;
  onLoadRecommendedGif?: (gifUrl: string, archetype: CreatureMotionArchetype) => void;
  showStatus?: (msg: string, type?: "success" | "error" | "info") => void;
}

export const MotionAdvisorPanel: React.FC<MotionAdvisorPanelProps> = ({
  shapeElement,
  zoneSettings,
  onUpdateSettings,
  onOpenArtworkStudio,
  onLoadRecommendedGif,
  showStatus,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"top_pick" | "explore_all">("top_pick");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [highContrastOnly, setHighContrastOnly] = useState<boolean>(false);
  const [selectedChoreographyArchetype, setSelectedChoreographyArchetype] =
    useState<CreatureMotionArchetype | null>(null);

  // Compute live geometry & motion analysis
  const analysis = useMemo(() => {
    if (!zoneSettings) return null;
    const metrics = analyzeShapeGeometry(shapeElement, zoneSettings);
    return generateMotionRecommendations(metrics, zoneSettings);
  }, [shapeElement, zoneSettings]);

  if (!zoneSettings || !analysis) return null;

  const { metrics, currentAlignmentScore, currentAlignmentFeedback, primaryRecommendation, allRecommendations } =
    analysis;

  // Filtered list for explore tab
  const filteredList = useMemo(() => {
    return filterArchetypes(allRecommendations, searchQuery, selectedCategory, highContrastOnly);
  }, [allRecommendations, searchQuery, selectedCategory, highContrastOnly]);

  const handleApplyArchetype = (archetype: CreatureMotionArchetype) => {
    const newSettings: ZoneSettings = {
      ...zoneSettings,
      revealDirection: archetype.recommendedSettings.revealDirection,
      frameCount: archetype.recommendedSettings.frameCount,
      windowWidth: archetype.recommendedSettings.windowWidth,
      notes: `${zoneSettings.notes ? zoneSettings.notes + "\n" : ""}[ADVISOR]: Tuned for '${archetype.name}' (${archetype.recommendedSettings.revealDirection.angle}° Parallax, ${archetype.recommendedSettings.frameCount} phases).`,
    };

    onUpdateSettings(newSettings);
    showStatus?.(
      `✓ Calibrated layer parameters for '${archetype.name}' (${archetype.recommendedSettings.revealDirection.angle}° parallax, ${archetype.recommendedSettings.frameCount} frames)!`,
      "success"
    );
  };

  const handleSliceAndApply = (archetype: CreatureMotionArchetype) => {
    handleApplyArchetype(archetype);
    if (archetype.gifUrl || archetype.gifPreviewUrl) {
      if (onLoadRecommendedGif) {
        onLoadRecommendedGif(archetype.gifUrl || archetype.gifPreviewUrl || "", archetype);
      } else if (onOpenArtworkStudio) {
        onOpenArtworkStudio();
      }
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "aquatic":
        return <Fish className="w-3.5 h-3.5 text-[#00f0ff]" />;
      case "aerial":
        return <Bug className="w-3.5 h-3.5 text-[#ff007f]" />;
      case "radial":
        return <RotateCcw className="w-3.5 h-3.5 text-[#00f0ff]" />;
      case "locomotion":
        return <Zap className="w-3.5 h-3.5 text-amber-400" />;
      case "serpentine":
        return <Activity className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Sparkles className="w-3.5 h-3.5 text-[#ff007f]" />;
    }
  };

  return (
    <div className="bg-[#0b0e14] border border-[#00f0ff]/30 rounded overflow-hidden font-mono shadow-[0_0_15px_rgba(0,240,255,0.08)]">
      {/* Header Banner */}
      <div className="p-3 bg-black/90 border-b border-[#262626] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-[#00f0ff]/10 border border-[#00f0ff]/40 text-[#00f0ff] rounded">
            <Wand2 className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-[#00f0ff] tracking-wider uppercase flex items-center gap-1.5">
              <span>AI MOTION & OPTICAL ADVISOR</span>
              <span className="px-1 py-0.2 bg-[#ff007f]/20 text-[#ff007f] border border-[#ff007f]/40 text-[8px] rounded">
                HIGH CONTRAST
              </span>
            </div>
            <div className="text-[8.5px] text-stone-400">
              Geometry: {metrics.aspectType} ({metrics.aspectRatio}x) • {metrics.principalAngle}° principal axis
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 text-stone-400 hover:text-white hover:bg-[#1f2430] transition-colors cursor-pointer"
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="p-3 space-y-3">
          {/* Live Geometry Metrics Strip */}
          <div className="grid grid-cols-3 gap-1.5 text-[9px] text-stone-400">
            <div className="bg-[#121620] border border-[#222838] p-1.5 flex flex-col justify-between">
              <span className="text-[8px] text-stone-500 uppercase">Aspect Ratio</span>
              <span className="font-bold text-stone-200 text-[10px] mt-0.5">
                {metrics.aspectRatio}x ({metrics.aspectType})
              </span>
            </div>

            <div className="bg-[#121620] border border-[#222838] p-1.5 flex flex-col justify-between">
              <span className="text-[8px] text-stone-500 uppercase">Contour Axis</span>
              <span className="font-bold text-[#00f0ff] text-[10px] mt-0.5">
                {metrics.principalAngle}° ({metrics.principalAngle < 30 || metrics.principalAngle > 150 ? "Horizontal" : metrics.principalAngle > 60 && metrics.principalAngle < 120 ? "Vertical" : "Diagonal"})
              </span>
            </div>

            <div className="bg-[#121620] border border-[#222838] p-1.5 flex flex-col justify-between">
              <span className="text-[8px] text-stone-500 uppercase">Path Length</span>
              <span className="font-bold text-[#ff007f] text-[10px] mt-0.5">
                {metrics.pathLength} px
              </span>
            </div>
          </div>

          {/* Scanimation Alignment / Wow Factor Meter */}
          <div className="bg-[#10141e] border border-[#262626] p-2 space-y-1.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-stone-400 uppercase font-bold tracking-wider">
                CURRENT WOW ALIGNMENT:
              </span>
              <span
                className={`font-black text-[10px] ${
                  currentAlignmentScore >= 80
                    ? "text-emerald-400"
                    : currentAlignmentScore >= 60
                    ? "text-[#00f0ff]"
                    : "text-amber-400"
                }`}
              >
                {currentAlignmentScore}% MATCH
              </span>
            </div>

            <div className="w-full bg-black h-1.5 rounded overflow-hidden border border-[#222]">
              <div
                className={`h-full transition-all duration-300 ${
                  currentAlignmentScore >= 80
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                    : currentAlignmentScore >= 60
                    ? "bg-[#00f0ff] shadow-[0_0_8px_rgba(0,240,255,0.5)]"
                    : "bg-amber-400"
                }`}
                style={{ width: `${currentAlignmentScore}%` }}
              />
            </div>

            <p className="text-[8px] text-stone-400 font-sans leading-tight">
              {currentAlignmentFeedback}
            </p>
          </div>

          {/* View Mode Toggle: Top Recommendation vs Pre-Pulled Sets Gallery */}
          <div className="flex rounded border border-[#262626] bg-[#0d121c] p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("top_pick")}
              className={`flex-1 py-1 text-[9.5px] font-bold uppercase transition-colors cursor-pointer rounded flex items-center justify-center gap-1 ${
                activeTab === "top_pick"
                  ? "bg-[#00f0ff] text-black"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>Top AI Pick</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("explore_all")}
              className={`flex-1 py-1 text-[9.5px] font-bold uppercase transition-colors cursor-pointer rounded flex items-center justify-center gap-1 ${
                activeTab === "explore_all"
                  ? "bg-[#ff007f] text-white"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              <Grid className="w-3 h-3" />
              <span>Pre-Pulled Sets ({allRecommendations.length})</span>
            </button>
          </div>

          {/* TAB 1: Top Recommendation Focus */}
          {activeTab === "top_pick" && (
            <div className="bg-gradient-to-b from-[#141b29] to-[#0e131d] border border-[#00f0ff]/40 p-3 space-y-2.5 relative rounded">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-[#00f0ff]/10 border border-[#00f0ff]/40 rounded">
                    {getCategoryIcon(primaryRecommendation.category)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] px-1 bg-[#00f0ff]/20 text-[#00f0ff] font-bold uppercase">
                        TOP RECOMMENDATION
                      </span>
                      <span className="text-[8px] text-emerald-400 font-bold">
                        ★ {primaryRecommendation.suitabilityScore}% WOW
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-white tracking-wide mt-0.5">
                      {primaryRecommendation.name}
                    </h4>
                  </div>
                </div>
              </div>

              {/* High Contrast Preview Image Box */}
              {(primaryRecommendation.gifPreviewUrl || primaryRecommendation.gifUrl) && (
                <div className="relative w-full h-32 bg-black border border-[#00f0ff]/30 rounded overflow-hidden group">
                  <img
                    src={primaryRecommendation.gifPreviewUrl || primaryRecommendation.gifUrl}
                    alt={primaryRecommendation.gifTitle || primaryRecommendation.name}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/85 backdrop-blur-sm border border-[#00f0ff]/40 text-[8px] font-bold text-[#00f0ff] uppercase flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-[#ff007f]" />
                    <span>HIGH CONTRAST SILHOUETTE</span>
                  </div>
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/85 backdrop-blur-sm border border-[#333] text-[8px] text-stone-300 font-mono">
                    {primaryRecommendation.recommendedSettings.frameCount}F • {primaryRecommendation.recommendedSettings.revealDirection.angle}°
                  </div>
                </div>
              )}

              <p className="text-[9.5px] text-stone-300 font-sans leading-relaxed">
                {primaryRecommendation.summary}
              </p>

              {/* Quick Specs Pill Badges */}
              <div className="flex flex-wrap gap-1 text-[8px]">
                <span className="px-1.5 py-0.5 bg-black/60 border border-[#333] text-stone-300">
                  Vector: <strong className="text-[#00f0ff]">{primaryRecommendation.recommendedSettings.revealDirection.angle}°</strong>
                </span>
                <span className="px-1.5 py-0.5 bg-black/60 border border-[#333] text-stone-300">
                  Frames: <strong className="text-[#ff007f]">{primaryRecommendation.recommendedSettings.frameCount} phases</strong>
                </span>
                <span className="px-1.5 py-0.5 bg-black/60 border border-[#333] text-stone-300">
                  Pitch: <strong className="text-stone-200">{primaryRecommendation.recommendedSettings.windowWidth.toFixed(2)}mm</strong>
                </span>
              </div>

              {/* 1-Click Action Buttons */}
              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleSliceAndApply(primaryRecommendation)}
                  className="flex-1 p-2 bg-[#ff007f] hover:bg-[#e0006f] text-white text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(255,0,127,0.3)] transition-all rounded"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>SLICE & APPLY TO CURVE</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedChoreographyArchetype(primaryRecommendation)}
                  className="px-2.5 py-2 bg-[#151d2d] hover:bg-[#1f2b40] border border-[#2a3854] text-[#00f0ff] text-[9px] font-bold uppercase flex items-center justify-center cursor-pointer transition-colors rounded"
                  title="View Frame Choreography"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Explore All Pre-Pulled Sets Gallery */}
          {activeTab === "explore_all" && (
            <div className="space-y-2.5">
              {/* Search & Filter Bar */}
              <div className="space-y-1.5">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search pre-pulled animations (e.g. cat, bird, wave, horse)..."
                    className="w-full bg-[#121622] border border-[#262626] focus:border-[#00f0ff] text-stone-100 text-[10px] px-2.5 py-1.5 pl-7 placeholder-stone-500 focus:outline-none rounded"
                  />
                  <Search className="w-3.5 h-3.5 text-stone-500 absolute left-2 top-2" />
                </div>

                {/* Category Chips & High Contrast Toggle */}
                <div className="flex items-center justify-between gap-1 pt-0.5">
                  <div className="flex flex-wrap gap-1 flex-1">
                    {[
                      { id: "all", label: "All" },
                      { id: "locomotion", label: "Locomotion" },
                      { id: "aquatic", label: "Aquatic" },
                      { id: "aerial", label: "Aerial" },
                      { id: "humanoid", label: "Human" },
                      { id: "celestial", label: "Cosmic" },
                      { id: "radial", label: "Radial" },
                      { id: "organic", label: "Organic" },
                    ].map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCategory(c.id)}
                        className={`px-1.5 py-0.5 rounded text-[8.5px] uppercase font-bold cursor-pointer transition-colors ${
                          selectedCategory === c.id
                            ? "bg-[#ff007f] text-white"
                            : "bg-[#141a26] text-stone-400 hover:text-stone-200 border border-[#262626]"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setHighContrastOnly(!highContrastOnly)}
                    className={`px-2 py-0.5 rounded text-[8.5px] font-bold uppercase cursor-pointer shrink-0 transition-all flex items-center gap-1 ${
                      highContrastOnly
                        ? "bg-black border border-[#00f0ff] text-[#00f0ff] shadow-[0_0_8px_rgba(0,240,255,0.3)] font-black"
                        : "bg-[#141a26] text-stone-400 hover:text-stone-200 border border-[#262626]"
                    }`}
                    title="Filter only high-contrast solid black and white silhouettes optimized for barrier grid scanimations"
                  >
                    <Sparkles className="w-2.5 h-2.5 text-[#00f0ff]" />
                    <span>B&W SILHOUETTES</span>
                  </button>
                </div>
              </div>

              {/* Archetypes List */}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {filteredList.map((archetype) => (
                  <div
                    key={archetype.id}
                    className="p-2.5 bg-[#10141e] hover:bg-[#141b29] border border-[#262626] hover:border-[#00f0ff]/50 rounded transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {getCategoryIcon(archetype.category)}
                        <span className="text-[10px] font-bold text-white truncate">
                          {archetype.name}
                        </span>
                      </div>
                      <span className="text-[8.5px] px-1.5 py-0.5 rounded bg-[#00f0ff]/15 text-[#00f0ff] border border-[#00f0ff]/30 font-bold shrink-0">
                        {archetype.suitabilityScore}% MATCH
                      </span>
                    </div>

                    {/* Thumbnail & Description */}
                    <div className="flex gap-2">
                      {archetype.gifPreviewUrl && (
                        <div className="w-16 h-14 bg-black border border-[#262626] rounded overflow-hidden shrink-0">
                          <img
                            src={archetype.gifPreviewUrl}
                            alt={archetype.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <p className="text-[8.5px] text-stone-400 line-clamp-2 leading-relaxed">
                          {archetype.summary}
                        </p>
                        <div className="text-[8px] text-stone-500 flex items-center gap-2 mt-1">
                          <span>{archetype.recommendedSettings.frameCount} Frames</span>
                          <span>•</span>
                          <span className="text-[#00f0ff]">{archetype.recommendedSettings.revealDirection.angle}° Angle</span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSliceAndApply(archetype)}
                        className="flex-1 py-1 px-2 bg-[#ff007f] hover:bg-[#e0006f] text-white text-[9px] font-bold uppercase rounded flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      >
                        <Scissors className="w-3 h-3" />
                        <span>SLICE INTO CURVE</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedChoreographyArchetype(archetype)}
                        className="px-2 py-1 bg-[#182030] hover:bg-[#222d42] text-stone-300 text-[8.5px] font-bold uppercase rounded flex items-center justify-center cursor-pointer border border-[#2a374f]"
                        title="Choreography Blueprint"
                      >
                        <Info className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}

                {filteredList.length === 0 && (
                  <div className="p-4 text-center text-xs text-stone-500 bg-[#0d121c] rounded border border-[#262626]">
                    No animations found matching "{searchQuery}". Try a broader term like "bird", "fish", or "wave".
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Frame-by-Frame Motion Choreography Modal */}
      {selectedChoreographyArchetype && (
        <MotionChoreographyModal
          isOpen={!!selectedChoreographyArchetype}
          onClose={() => setSelectedChoreographyArchetype(null)}
          archetype={selectedChoreographyArchetype}
          metrics={metrics}
          zoneSettings={zoneSettings}
          onApplyRecommendation={(arch) => {
            handleApplyArchetype(arch);
            setSelectedChoreographyArchetype(null);
          }}
          onOpenArtworkStudio={() => {
            handleSliceAndApply(selectedChoreographyArchetype);
            setSelectedChoreographyArchetype(null);
          }}
        />
      )}
    </div>
  );
};
