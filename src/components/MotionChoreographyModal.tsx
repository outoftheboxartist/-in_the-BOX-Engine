/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Play,
  Pause,
  Compass,
  Sliders,
  Check,
  ArrowRight,
  Fish,
  Bug,
  RotateCcw,
  Zap,
  Activity,
  Layers,
  ChevronRight,
  Info,
  Flame,
  Wand2,
} from "lucide-react";
import { CreatureMotionArchetype, ShapeMetrics } from "../utils/motionSuggester";
import { ZoneSettings } from "../types";

interface MotionChoreographyModalProps {
  isOpen: boolean;
  onClose: () => void;
  archetype: CreatureMotionArchetype | null;
  metrics: ShapeMetrics | null;
  zoneSettings: ZoneSettings | null;
  onApplyRecommendation: (archetype: CreatureMotionArchetype) => void;
  onOpenArtworkStudio?: () => void;
  onLoadArchetypeAnimation?: (archetype: CreatureMotionArchetype) => void;
}

export const MotionChoreographyModal: React.FC<MotionChoreographyModalProps> = ({
  isOpen,
  onClose,
  archetype,
  metrics,
  zoneSettings,
  onApplyRecommendation,
  onOpenArtworkStudio,
  onLoadArchetypeAnimation,
}) => {
  const [activeFrame, setActiveFrame] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeedMs, setPlaybackSpeedMs] = useState<number>(180);

  useEffect(() => {
    if (!isOpen || !archetype) return;
    setActiveFrame(0);
    setIsPlaying(true);
  }, [isOpen, archetype]);

  useEffect(() => {
    if (!isPlaying || !archetype || archetype.frameChoreography.length === 0) return;
    const interval = setInterval(() => {
      setActiveFrame((prev) => (prev + 1) % archetype.frameChoreography.length);
    }, playbackSpeedMs);
    return () => clearInterval(interval);
  }, [isPlaying, archetype, playbackSpeedMs]);

  if (!isOpen || !archetype) return null;

  const totalFrames = archetype.frameChoreography.length;
  const currentFrameData = archetype.frameChoreography[activeFrame] || archetype.frameChoreography[0];

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "aquatic":
        return <Fish className="w-5 h-5 text-[#00f0ff]" />;
      case "aerial":
        return <Bug className="w-5 h-5 text-[#ff007f]" />;
      case "radial":
        return <RotateCcw className="w-5 h-5 text-[#00f0ff]" />;
      case "locomotion":
        return <Zap className="w-5 h-5 text-amber-400 text-amber-300" />;
      case "serpentine":
        return <Activity className="w-5 h-5 text-emerald-400" />;
      default:
        return <Sparkles className="w-5 h-5 text-[#00f0ff]" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 font-mono select-none animate-in fade-in duration-200">
      <div className="bg-[#0c0f17] border border-[#00f0ff]/40 shadow-[0_0_40px_rgba(0,240,255,0.2)] w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col text-stone-300">
        {/* Header */}
        <div className="px-5 py-3.5 bg-black/95 border-b border-[#262626] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#121826] border border-[#00f0ff]/30 rounded">
              {getCategoryIcon(archetype.category)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#00f0ff] tracking-wider uppercase">
                  AI SCANIMATION MOTION BLUEPRINT
                </span>
                <span className="px-2 py-0.5 bg-[#00f0ff]/10 text-[#00f0ff] text-[9px] border border-[#00f0ff]/30 uppercase font-black">
                  {archetype.suitabilityScore}% WOW MATCH
                </span>
              </div>
              <h3 className="text-base font-bold text-white tracking-wide mt-0.5">
                {archetype.name}
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

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 max-h-[75vh]">
          {/* Top Overview & Optical Physics Explanation */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Optical Advantage Explanation & Visual GIF Preview */}
            <div className="md:col-span-2 bg-[#111622] border border-[#00f0ff]/20 p-4 space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-bold text-[#00f0ff] uppercase tracking-wider">
                <Wand2 className="w-3.5 h-3.5" />
                <span>WHY THIS CREATES MAXIMUM SCANIMATION "WOW" FACTOR</span>
              </div>

              {/* Animated GIF motion preview */}
              {(archetype.gifPreviewUrl || archetype.gifUrl) && (
                <div className="w-full h-36 bg-black border border-[#00f0ff]/30 rounded overflow-hidden relative">
                  <img
                    src={archetype.gifPreviewUrl || archetype.gifUrl}
                    alt={archetype.gifTitle || archetype.name}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-black/80 backdrop-blur-sm border border-[#00f0ff]/40 text-[8.5px] font-bold text-[#00f0ff] uppercase flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-[#ff007f]" />
                    <span>RECOMMENDED CREATURE MOTION CYCLE</span>
                  </div>
                </div>
              )}

              <p className="text-xs text-stone-300 leading-relaxed font-sans">
                {archetype.whyItWorks}
              </p>
              {archetype.suitabilityReasons.length > 0 && (
                <div className="pt-2 border-t border-[#1e293b] space-y-1">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                    Geometric Compatibility:
                  </span>
                  <ul className="text-[11px] text-stone-400 space-y-1">
                    {archetype.suitabilityReasons.map((reason, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-[#00f0ff] text-xs">■</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Recommended Calibration Card */}
            <div className="bg-[#121212] border border-[#262626] p-4 flex flex-col justify-between">
              <div>
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">
                  OPTIMAL CALIBRATION SPECS
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between pb-1 border-b border-[#222]">
                    <span className="text-stone-400">Reveal Vector</span>
                    <span className="font-bold text-[#00f0ff]">
                      {archetype.recommendedSettings.revealDirection.angle}° (
                      {archetype.recommendedSettings.revealDirection.angle === 0
                        ? "Horizontal"
                        : archetype.recommendedSettings.revealDirection.angle === 90
                        ? "Vertical"
                        : "Diagonal"}
                      )
                    </span>
                  </div>
                  <div className="flex items-center justify-between pb-1 border-b border-[#222]">
                    <span className="text-stone-400">Frame Count</span>
                    <span className="font-bold text-[#ff007f]">
                      {archetype.recommendedSettings.frameCount} Phases
                    </span>
                  </div>
                  <div className="flex items-center justify-between pb-1 border-b border-[#222]">
                    <span className="text-stone-400">Window Pitch</span>
                    <span className="font-bold text-stone-200">
                      {archetype.recommendedSettings.windowWidth.toFixed(2)} mm
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-400">Path Length</span>
                    <span className="font-bold text-stone-200">{metrics?.pathLength || 250} px</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  onApplyRecommendation(archetype);
                  onClose();
                }}
                className="mt-3 w-full py-2 bg-[#00f0ff] hover:bg-[#33f5ff] text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)] cursor-pointer active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>APPLY OPTIMAL SPECS</span>
              </button>
            </div>
          </div>

          {/* Interactive Frame Choreography Sequencer */}
          <div className="bg-[#10141d] border border-[#262626] p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-[#262626] pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#00f0ff]" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  FRAME-BY-FRAME MOTION BLUEPRINT ({totalFrames} PHASES)
                </span>
              </div>

              {/* Playback Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`px-2.5 py-1 text-[10px] font-bold border flex items-center gap-1.5 cursor-pointer transition-all ${
                    isPlaying
                      ? "bg-[#00f0ff]/20 border-[#00f0ff] text-[#00f0ff]"
                      : "bg-[#181818] border-[#333] text-stone-400 hover:text-white"
                  }`}
                >
                  {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{isPlaying ? "PAUSE PREVIEW" : "PLAY CYCLE"}</span>
                </button>
              </div>
            </div>

            {/* Active Phase Spotlight */}
            <div className="bg-[#0b0e14] border border-[#00f0ff]/30 p-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-[#00f0ff] text-black text-[10px] font-black uppercase">
                    PHASE #{activeFrame + 1} OF {totalFrames}
                  </span>
                  <h4 className="text-sm font-bold text-white">{currentFrameData.phaseName}</h4>
                </div>
                <p className="text-xs text-stone-300 font-sans leading-relaxed">
                  {currentFrameData.description}
                </p>
                <div className="text-[11px] text-[#00f0ff] flex items-center gap-1.5 pt-1">
                  <span className="font-bold uppercase tracking-wider">Drawing Cue:</span>
                  <span className="font-sans italic">{currentFrameData.motionCue}</span>
                </div>
              </div>
            </div>

            {/* Scannable Frame Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {archetype.frameChoreography.map((f, idx) => {
                const isActive = idx === activeFrame;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setActiveFrame(idx);
                    }}
                    className={`p-2.5 border text-left flex flex-col justify-between h-20 transition-all cursor-pointer ${
                      isActive
                        ? "bg-[#00f0ff]/20 border-[#00f0ff] shadow-[0_0_15px_rgba(0,240,255,0.25)] text-white"
                        : "bg-[#141822] border-[#262626] text-stone-400 hover:border-[#444] hover:text-stone-200"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full text-[10px] font-bold font-mono">
                      <span className={isActive ? "text-[#00f0ff]" : "text-stone-400"}>
                        F#{idx + 1}
                      </span>
                      {isActive && <span className="w-1.5 h-1.5 bg-[#00f0ff] rounded-full animate-ping" />}
                    </div>

                    <div className="text-[10px] font-bold truncate leading-tight mt-1">
                      {f.phaseName}
                    </div>

                    <div className="text-[8px] text-stone-500 truncate">{f.motionCue}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-black/95 border-t border-[#262626] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#181818] hover:bg-[#252525] text-stone-400 hover:text-white border border-[#333] text-xs font-bold transition-all cursor-pointer"
          >
            CLOSE
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onApplyRecommendation(archetype);
                if (onLoadArchetypeAnimation) {
                  onLoadArchetypeAnimation(archetype);
                } else if (onOpenArtworkStudio) {
                  onOpenArtworkStudio();
                }
                onClose();
              }}
              className="px-4 py-2 bg-gradient-to-r from-[#ff007f] to-[#ff3399] hover:from-[#ff1a8c] hover:to-[#ff4da6] text-white border border-[#ff007f] text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-[0_0_15px_rgba(255,0,127,0.35)] active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>⚡ ADD TO SLICED PROJECT & OPEN STUDIO</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
