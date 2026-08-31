/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Copy, Check, X, Layers, CheckSquare, Square, ArrowRight, Sparkles } from "lucide-react";
import { FrameArtwork, ZoneSettings } from "../types";

interface CopyFrameModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceFrameIndex: number;
  totalFrames: number;
  frames: FrameArtwork[];
  zoneSettings?: ZoneSettings;
  onApplyCopy: (options: {
    sourceIndex: number;
    targetIndices: number[];
    includeStrokes: boolean;
    includeImage: boolean;
    mode: "replace" | "merge";
  }) => void;
}

export const CopyFrameModal: React.FC<CopyFrameModalProps> = ({
  isOpen,
  onClose,
  sourceFrameIndex,
  totalFrames,
  frames,
  zoneSettings,
  onApplyCopy,
}) => {
  const [selectedTargets, setSelectedTargets] = useState<number[]>([]);
  const [includeStrokes, setIncludeStrokes] = useState<boolean>(true);
  const [includeImage, setIncludeImage] = useState<boolean>(true);
  const [copyMode, setCopyMode] = useState<"replace" | "merge">("replace");

  const sourceFrame = frames[sourceFrameIndex] || { frameIndex: sourceFrameIndex, strokes: [] };
  const strokeCount = sourceFrame.strokes?.length || 0;
  const hasImage = !!sourceFrame.imageDataUrl;

  // Initialize selected targets (default to all other frames in sequence)
  useEffect(() => {
    if (isOpen) {
      const allOthers = Array.from({ length: totalFrames }, (_, i) => i).filter(
        (i) => i !== sourceFrameIndex
      );
      setSelectedTargets(allOthers);
      setIncludeStrokes(strokeCount > 0);
      setIncludeImage(hasImage);
    }
  }, [isOpen, sourceFrameIndex, totalFrames, strokeCount, hasImage]);

  if (!isOpen) return null;

  const toggleTarget = (idx: number) => {
    if (idx === sourceFrameIndex) return; // Cannot target source frame
    setSelectedTargets((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const handleSelectAll = () => {
    setSelectedTargets(
      Array.from({ length: totalFrames }, (_, i) => i).filter((i) => i !== sourceFrameIndex)
    );
  };

  const handleSelectRemaining = () => {
    setSelectedTargets(
      Array.from({ length: totalFrames }, (_, i) => i).filter((i) => i > sourceFrameIndex)
    );
  };

  const handleClearSelection = () => {
    setSelectedTargets([]);
  };

  const handleConfirm = () => {
    if (selectedTargets.length === 0) return;
    onApplyCopy({
      sourceIndex: sourceFrameIndex,
      targetIndices: selectedTargets,
      includeStrokes,
      includeImage,
      mode: copyMode,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono select-none animate-in fade-in duration-150">
      <div className="bg-[#0e1117] border border-[#00f0ff]/40 shadow-[0_0_30px_rgba(0,240,255,0.15)] w-full max-w-lg overflow-hidden flex flex-col text-stone-300">
        {/* Header */}
        <div className="px-4 py-3 bg-black/90 border-b border-[#262626] flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Copy className="w-4 h-4 text-[#00f0ff]" />
            <span className="font-bold text-xs tracking-wider uppercase">
              COPY FRAME #{sourceFrameIndex + 1} ARTWORK TO SEQUENCE
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#222] text-stone-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Source Frame Overview Card */}
          <div className="bg-[#141822] border border-[#00f0ff]/20 p-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-stone-400 font-bold uppercase tracking-wider">
                SOURCE FRAME
              </div>
              <div className="text-sm font-bold text-[#00f0ff] flex items-center gap-1.5 mt-0.5">
                <span>FRAME #{sourceFrameIndex + 1} OF {totalFrames}</span>
                <span className="text-xs text-stone-500 font-normal">
                  ({zoneSettings?.zoneName || "Sequence"})
                </span>
              </div>
            </div>
            <div className="text-right text-[11px] font-mono">
              <div className="text-stone-300">
                <span className="text-white font-bold">{strokeCount}</span> strokes
              </div>
              <div className={hasImage ? "text-[#ff007f]" : "text-stone-600"}>
                {hasImage ? "Image layer present" : "No image layer"}
              </div>
            </div>
          </div>

          {/* Content To Copy Toggles */}
          <div className="bg-[#111] border border-[#262626] p-3 space-y-2">
            <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
              1. CONTENT TO COPY
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label
                className={`flex items-center gap-2 p-2 border cursor-pointer transition-all ${
                  includeStrokes
                    ? "bg-[#00f0ff]/10 border-[#00f0ff]/50 text-white"
                    : "bg-[#181818] border-[#333] text-stone-500"
                }`}
              >
                <input
                  type="checkbox"
                  checked={includeStrokes}
                  onChange={(e) => setIncludeStrokes(e.target.checked)}
                  className="accent-[#00f0ff]"
                />
                <span>Drawn Strokes ({strokeCount})</span>
              </label>

              <label
                className={`flex items-center gap-2 p-2 border cursor-pointer transition-all ${
                  includeImage
                    ? "bg-[#ff007f]/10 border-[#ff007f]/50 text-white"
                    : "bg-[#181818] border-[#333] text-stone-500"
                } ${!hasImage ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="checkbox"
                  disabled={!hasImage}
                  checked={includeImage && hasImage}
                  onChange={(e) => setIncludeImage(e.target.checked)}
                  className="accent-[#ff007f]"
                />
                <span>Attached Image</span>
              </label>
            </div>
          </div>

          {/* Copy Mode: Replace vs Merge */}
          <div className="bg-[#111] border border-[#262626] p-3 space-y-2">
            <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
              2. PASTE BEHAVIOR
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setCopyMode("replace")}
                className={`p-2 border text-left cursor-pointer transition-all ${
                  copyMode === "replace"
                    ? "bg-[#00f0ff]/15 border-[#00f0ff] text-white"
                    : "bg-[#161616] border-[#333] text-stone-400 hover:bg-[#202020]"
                }`}
              >
                <div className="font-bold text-[#00f0ff] flex items-center gap-1">
                  <span>REPLACE</span>
                  {copyMode === "replace" && <Check className="w-3 h-3 text-[#00f0ff]" />}
                </div>
                <div className="text-[10px] text-stone-400 mt-0.5">
                  Overwrites target frame's artwork
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCopyMode("merge")}
                className={`p-2 border text-left cursor-pointer transition-all ${
                  copyMode === "merge"
                    ? "bg-[#00f0ff]/15 border-[#00f0ff] text-white"
                    : "bg-[#161616] border-[#333] text-stone-400 hover:bg-[#202020]"
                }`}
              >
                <div className="font-bold text-[#00f0ff] flex items-center gap-1">
                  <span>MERGE / LAYER</span>
                  {copyMode === "merge" && <Check className="w-3 h-3 text-[#00f0ff]" />}
                </div>
                <div className="text-[10px] text-stone-400 mt-0.5">
                  Adds strokes on top of existing artwork
                </div>
              </button>
            </div>
          </div>

          {/* Target Frame Selection */}
          <div className="bg-[#111] border border-[#262626] p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                3. SELECT TARGET FRAMES ({selectedTargets.length} selected)
              </div>
              <div className="flex items-center gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="px-1.5 py-0.5 bg-[#222] hover:bg-[#333] text-stone-300 border border-[#444] cursor-pointer"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={handleSelectRemaining}
                  className="px-1.5 py-0.5 bg-[#222] hover:bg-[#333] text-stone-300 border border-[#444] cursor-pointer"
                >
                  Remaining
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-1.5 py-0.5 bg-[#222] hover:bg-[#333] text-stone-300 border border-[#444] cursor-pointer"
                >
                  None
                </button>
              </div>
            </div>

            {/* Grid of Target Frame Badges */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {Array.from({ length: totalFrames }, (_, i) => {
                const isSource = i === sourceFrameIndex;
                const isTarget = selectedTargets.includes(i);
                const targetFrame = frames[i];
                const hasExistingStrokes = (targetFrame?.strokes?.length || 0) > 0;

                return (
                  <button
                    key={i}
                    type="button"
                    disabled={isSource}
                    onClick={() => toggleTarget(i)}
                    className={`h-14 border p-1 flex flex-col items-center justify-between text-xs transition-all cursor-pointer relative ${
                      isSource
                        ? "bg-[#00f0ff]/5 border-[#00f0ff]/30 text-stone-500 cursor-not-allowed opacity-50"
                        : isTarget
                        ? "bg-[#00f0ff]/20 border-[#00f0ff] text-white shadow-[0_0_10px_rgba(0,240,255,0.2)]"
                        : "bg-[#181818] border-[#333] text-stone-400 hover:border-[#555]"
                    }`}
                  >
                    <div className="w-full flex items-center justify-between text-[9px] font-bold">
                      <span className={isTarget ? "text-[#00f0ff]" : "text-stone-400"}>
                        F{i + 1}
                      </span>
                      {isSource ? (
                        <span className="text-[8px] bg-[#00f0ff]/20 text-[#00f0ff] px-1">SRC</span>
                      ) : isTarget ? (
                        <Check className="w-2.5 h-2.5 text-[#00f0ff]" />
                      ) : null}
                    </div>

                    <div className="text-[8px] text-stone-500">
                      {isSource
                        ? "Source"
                        : hasExistingStrokes
                        ? `${targetFrame?.strokes?.length} strk`
                        : "Empty"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-black/90 border-t border-[#262626] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-[#181818] hover:bg-[#252525] text-stone-400 hover:text-white border border-[#333] text-xs font-bold transition-all cursor-pointer"
          >
            CANCEL
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedTargets.length === 0 || (!includeStrokes && !includeImage)}
              onClick={handleConfirm}
              className="px-4 py-1.5 bg-[#00f0ff] hover:bg-[#33f5ff] text-black border border-[#00f0ff] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(0,240,255,0.3)] active:scale-95"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>
                COPY TO {selectedTargets.length} {selectedTargets.length === 1 ? "FRAME" : "FRAMES"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
