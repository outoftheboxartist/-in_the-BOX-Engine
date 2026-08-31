/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { Search, Upload, FileCode, ArrowRight, CornerDownRight, Bookmark, Compass, Heart, Image as ImageIcon, Eye, EyeOff, Pipette, Scissors, CheckCircle2 } from "lucide-react";
import { SVGZoneInfo, ZoneSettings } from "../types";
import { SAMPLE_SVGS } from "../sampleSvgs";

interface ZoneListSidebarProps {
  zones: SVGZoneInfo[];
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string | null) => void;
  zoneSettings: Record<string, ZoneSettings>;
  onUploadSvg: (file: File) => void;
  onSelectTemplate: (index: number) => void;
  onOpenImageTracer: () => void;
  onOpenColorTracer: () => void;
  hiddenZoneIds?: Record<string, boolean>;
  onToggleZoneVisibility?: (zoneId: string) => void;
  onRenameZone?: (zoneId: string, newName: string) => void;
  onChangeZoneFrames?: (zoneId: string, count: number) => void;
}

export function ZoneListSidebar({
  zones,
  selectedZoneId,
  onSelectZone,
  zoneSettings,
  onUploadSvg,
  onSelectTemplate,
  onOpenImageTracer,
  onOpenColorTracer,
  hiddenZoneIds = {},
  onToggleZoneVisibility = () => {},
  onRenameZone,
  onChangeZoneFrames,
}: ZoneListSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inline editing state for curve names and frame counts
  const [editingState, setEditingState] = useState<{
    zoneId: string;
    field: "name" | "frames";
    value: string;
  } | null>(null);

  const handleCommitEdit = () => {
    if (!editingState) return;
    if (editingState.field === "name" && onRenameZone) {
      if (editingState.value.trim()) {
        onRenameZone(editingState.zoneId, editingState.value.trim());
      }
    } else if (editingState.field === "frames" && onChangeZoneFrames) {
      const num = parseInt(editingState.value, 10);
      if (!isNaN(num) && num >= 0) {
        onChangeZoneFrames(editingState.zoneId, num);
      }
    }
    setEditingState(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadSvg(e.target.files[0]);
    }
  };

  // Filter zones matching search query
  const filteredZones = zones.filter((zone) => {
    const settings = zoneSettings[zone.id];
    const name = settings?.zoneName || zone.defaultName;
    const type = zone.tagName;
    const query = searchQuery.toLowerCase();
    return name.toLowerCase().includes(query) || type.toLowerCase().includes(query);
  });

  // Get vector arrow character based on degrees for sidebar row
  const getDirectionArrow = (deg: number) => {
    if (deg >= 338 || deg < 23) return "→"; // horizontal right
    if (deg >= 23 && deg < 68) return "↘"; // diagonal down right
    if (deg >= 68 && deg < 113) return "↓"; // vertical down
    if (deg >= 113 && deg < 158) return "↙"; // diagonal down left
    if (deg >= 158 && deg < 203) return "←"; // horizontal left
    if (deg >= 203 && deg < 248) return "↖"; // diagonal up left
    if (deg >= 248 && deg < 293) return "↑"; // vertical up
    return "↗"; // diagonal up right
  };

  return (
    <div className="w-full md:w-80 h-full border-b md:border-b-0 md:border-r border-[#262626] bg-[#0c0c0c] flex flex-col overflow-hidden shrink-0">
      {/* Sidebar header */}
      <div className="p-4 border-b border-[#262626] flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="text-sm font-black text-[#00f0ff] tracking-widest font-mono">
              [INTHE] <span className="text-white">BOX</span>
            </div>
            <span className="text-[9px] bg-[#00f0ff]/10 border border-[#00f0ff]/20 text-[#00f0ff] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-widest leading-none">
              V1.0
            </span>
          </div>
        </div>

        {/* Upload vector / Image Trace Split Buttons */}
        <div className="flex flex-col gap-1.5">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".svg"
              onChange={handleFileChange}
              className="hidden"
              id="svg-uploader"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full cursor-pointer p-2 rounded bg-black hover:bg-[#121212] border border-[#ff007f]/20 hover:border-[#ff007f]/40 text-[#ff007f] text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 transition-all"
              title="Upload custom design SVG file"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>UPLOAD SVG</span>
            </button>
          </div>

          <button
            onClick={onOpenColorTracer}
            className="w-full cursor-pointer p-2 rounded bg-black hover:bg-[#121212] border border-amber-500/20 hover:border-amber-500/40 text-amber-500 text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 transition-all"
            title="Trace shapes dynamically by selecting matching pixel colors"
          >
            <Pipette className="w-3.5 h-3.5" />
            <span>COLOR SELECT TRACE</span>
          </button>

          <button
            onClick={onOpenImageTracer}
            className="w-full cursor-pointer p-2 rounded bg-black hover:bg-[#121212] border border-[#00f0ff]/20 hover:border-[#00f0ff]/40 text-[#00f0ff] text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 transition-all"
            title="Convert photos/logos into vector paths"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>TRACE IMAGE (B&W)</span>
          </button>
        </div>

        {/* Templates selector dropdown/buttons */}
        <div className="p-2 bg-black/40 rounded border border-[#262626]">
          <div className="text-[9px] font-mono text-[#00f0ff] mb-1.5 uppercase tracking-widest flex items-center gap-1">
            <Compass className="w-3 h-3" />
            <span>SVG VECTOR TEMPLATES</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {SAMPLE_SVGS.map((tmpl, idx) => (
              <button
                key={tmpl.name}
                onClick={() => onSelectTemplate(idx)}
                className="p-1 px-1.5 rounded bg-[#121212] text-[9px] text-stone-300 hover:text-white hover:bg-[#1a1a1a] border border-[#262626] text-center truncate font-bold font-mono transition-all uppercase tracking-wider"
                title={tmpl.description}
              >
                {tmpl.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter and search indicator */}
      {zones.length > 0 && (
        <div className="px-4 py-2 bg-black/50 border-b border-[#262626] flex items-center gap-2 shrink-0">
          <Search className="w-3.5 h-3.5 text-stone-500" />
          <input
            id="sidebar-search"
            type="text"
            placeholder="FILTER SHAPES OR TAGS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-[10px] bg-transparent border-none text-stone-200 placeholder-stone-600 focus:outline-none focus:ring-0 font-mono tracking-widest uppercase"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-[10px] font-mono text-[#ff007f] hover:text-rose-450 px-1 font-bold"
            >
              CLEAR
            </button>
          )}
        </div>
      )}

      {/* Lists of zones / shapes */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-[#0c0c0c]">
        {zones.length > 0 ? (
          <div className="flex flex-col p-2 gap-1">
            {/* List group header */}
            <div className="px-2 py-1 flex items-center justify-between text-[9px] font-mono uppercase tracking-widest text-[#00f0ff] mb-1 font-bold">
              <span>DETECTION INSTANCES</span>
              <span>{filteredZones.length} / {zones.length}</span>
            </div>

            {filteredZones.map((zone) => {
              const settings = zoneSettings[zone.id];
              const isSelected = selectedZoneId === zone.id;
              const isHidden = !!hiddenZoneIds[zone.id];
              const name = settings?.zoneName || zone.defaultName;
              
              // Find arrow details
              const arrow = settings ? getDirectionArrow(settings.revealDirection.angle) : "→";
              const frames = settings?.frameCount || 6;

              // Find minimum frame count of active zones to establish baseline color coding
              const activeZoneSettings = zones
                .filter((z) => !hiddenZoneIds[z.id])
                .map((z) => zoneSettings[z.id]?.frameCount || 6);
              const minFrameCount = activeZoneSettings.length > 0 ? Math.min(...activeZoneSettings) : 2;

              const fc = settings?.frameCount || 6;
              const step = fc - minFrameCount;
              // Start with the current color pattern of preview and darken for each increase in frame count
              const lightness = Math.max(12, 55 - step * 6);
              const colorToken = `hsl(195, 90%, ${lightness}%)`;

              return (
                <div
                  key={zone.id}
                  className={`w-full group rounded border flex items-center justify-between transition-all ${
                    isSelected
                      ? "bg-[#ff007f]/15 border-[#ff007f]/60 text-[#ff007f] shadow-[0_0_12px_rgba(255,0,127,0.25)]"
                      : "bg-[#121212]/50 hover:bg-[#1a1a1a]/80 border-[#262626] text-stone-300"
                  }`}
                >
                  <button
                    onClick={() => onSelectZone(zone.id)}
                    className={`flex-1 text-left p-2 flex items-center justify-between gap-3 text-xs min-w-0 cursor-pointer ${
                      isHidden ? "opacity-35" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {/* Badge showing tag name */}
                      <span
                        className={`font-mono text-[9px] px-1.5 py-0.5 rounded uppercase leading-none font-black tracking-wider ${
                          isSelected
                            ? "bg-[#ff007f]/25 text-[#ff007f] border border-[#ff007f]/50"
                            : "bg-black text-[#ff007f]/70 border border-[#262626]"
                        }`}
                      >
                        {zone.tagName === "path" ? "PTH" : zone.tagName.slice(0, 3)}
                      </span>
                      
                      <div className="flex flex-col truncate">
                        {editingState?.zoneId === zone.id && editingState.field === "name" ? (
                          <input
                            type="text"
                            value={editingState.value}
                            autoFocus
                            onChange={(e) =>
                              setEditingState({
                                ...editingState,
                                value: e.target.value,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleCommitEdit();
                              if (e.key === "Escape") setEditingState(null);
                            }}
                            onBlur={handleCommitEdit}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                            className="bg-black text-[#00f0ff] font-mono text-[11px] font-bold px-1 py-0.2 rounded border border-[#00f0ff] uppercase outline-none animate-pulse ring-2 ring-[#00f0ff]/80 shadow-[0_0_12px_rgba(0,240,255,0.8)]"
                          />
                        ) : (
                          <span
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingState({
                                zoneId: zone.id,
                                field: "name",
                                value: name,
                              });
                            }}
                            title="Double-click to rename curve"
                            className={`font-bold text-[11px] truncate uppercase tracking-wide cursor-text select-text ${
                              isSelected ? "text-[#ff007f] font-black" : "text-[#ff007f]/90 group-hover:text-[#ff007f]"
                            } ${isHidden ? "line-through text-stone-600 italic" : ""}`}
                          >
                            {name}
                          </span>
                        )}
                        {zone.originalId && (
                          <span className="text-[9px] text-stone-500 font-mono truncate">
                            ID: #{zone.originalId}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Summary markers (arrow, frames count with color dot) */}
                    <div className="flex items-center gap-1.5 shrink-0 font-mono text-[9px]">
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center border font-black text-[10px] ${
                          isSelected
                            ? "bg-[#ff007f]/25 border-[#ff007f]/50 text-[#ff007f]"
                            : "bg-black border-[#262626] text-stone-400"
                        }`}
                        title={`${settings?.revealDirection.angle}° reveal direction`}
                      >
                        {arrow}
                      </span>
                      <div className="flex items-center gap-1 pl-1" title="Double-click to edit frame count">
                        <span 
                          className="w-[7px] h-[7px] rounded-full inline-block border border-neutral-800 shrink-0"
                          style={{ backgroundColor: colorToken }} 
                        />
                        {editingState?.zoneId === zone.id && editingState.field === "frames" ? (
                          <input
                            type="number"
                            min="0"
                            max="24"
                            value={editingState.value}
                            autoFocus
                            onChange={(e) =>
                              setEditingState({
                                ...editingState,
                                value: e.target.value,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleCommitEdit();
                              if (e.key === "Escape") setEditingState(null);
                            }}
                            onBlur={handleCommitEdit}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                            className="w-10 bg-black text-[#00f0ff] font-mono text-[10px] font-bold px-1 py-0 rounded border border-[#00f0ff] outline-none animate-pulse ring-2 ring-[#00f0ff]/80 shadow-[0_0_10px_rgba(0,240,255,0.8)]"
                          />
                        ) : (
                          <span
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingState({
                                zoneId: zone.id,
                                field: "frames",
                                value: String(frames),
                              });
                            }}
                            className={`font-mono font-bold cursor-text transition-colors ${
                              frames <= 1 || settings?.isSolid
                                ? "text-[#ff007f] hover:text-[#00f0ff]"
                                : "text-[#ff007f]/80 hover:text-[#00f0ff]"
                            }`}
                            title={
                              frames <= 1 || settings?.isSolid
                                ? "Solid curve (0 frames). Double-click to change frame count."
                                : `${frames} frames. Double-click to edit frame count.`
                            }
                          >
                            {frames <= 1 || settings?.isSolid ? "SOLID" : `${frames}F`}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Eye visibility toggle action */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleZoneVisibility(zone.id);
                    }}
                    title={isHidden ? "Unhide Layer" : "Hide Layer"}
                    className={`p-1.5 mr-1 rounded hover:bg-[#1f1f1f] cursor-pointer transition-colors shrink-0 ${
                      isHidden ? "text-stone-600 hover:text-stone-400" : "text-[#ff007f]/70 hover:text-[#ff007f]"
                    }`}
                  >
                    {isHidden ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              );
            })}

            {filteredZones.length === 0 && (
              <div className="p-8 text-center text-stone-600 text-xs font-mono">
                NO SELECTIONS RECORDED
              </div>
            )}
          </div>
        ) : (
          <div className="h-full p-6 flex flex-col justify-center items-center text-center">
            <div className="p-3 bg-black border border-[#262626] rounded text-stone-400 mb-3 shadow-md">
              <FileCode className="w-5 h-5 text-[#ff007f]" />
            </div>
            <h4 className="text-stone-300 font-bold font-mono text-xs mb-1 uppercase tracking-widest">MAP ENGINE OFFLINE</h4>
            <p className="text-stone-500 text-[10px] font-mono leading-relaxed max-w-[200px] uppercase">
              Drag-and-drop or select an SVG element to index vector paths.
            </p>
          </div>
        )}
      </div>

      {/* Aesthetic credit banner */}
      <div className="hidden md:flex p-3 bg-black border-t border-[#262626] shrink-0 text-center items-center justify-center gap-1.5 font-mono text-[9px] text-stone-600 tracking-widest uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] animate-ping" />
        <span>SCANIMATION CORE V1.0</span>
      </div>
    </div>
  );
}
