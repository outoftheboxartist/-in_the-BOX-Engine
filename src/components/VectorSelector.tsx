/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from "react";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { Vector2D } from "../types";

interface VectorSelectorProps {
  value: Vector2D;
  onChange: (value: Vector2D) => void;
}

export function VectorSelector({ value, onChange }: VectorSelectorProps) {
  const containerRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const RADIUS = 45; // Grid circle radius inside 100x100 space
  const CENTER = 50; // Center coordinate inside 100x100 space

  // Calculate coordinates for rendering handle representing angle
  const angleRad = (value.angle * Math.PI) / 180;
  const handleX = CENTER + RADIUS * Math.cos(angleRad);
  const handleY = CENTER + RADIUS * Math.sin(angleRad);

  const updateAngleFromCoords = (clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - (rect.left + rect.width / 2);
    const y = clientY - (rect.top + rect.height / 2);

    let angleRad = Math.atan2(y, x);
    let angleDeg = Math.round((angleRad * 180) / Math.PI);
    
    // Normalize to [0, 360)
    if (angleDeg < 0) {
      angleDeg += 360;
    }

    // Keep unit vector components
    const dx = Math.cos(angleRad);
    const dy = Math.sin(angleRad);

    onChange({
      dx: parseFloat(dx.toFixed(4)),
      dy: parseFloat(dy.toFixed(4)),
      angle: angleDeg,
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    updateAngleFromCoords(e.clientX, e.clientY);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      updateAngleFromCoords(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Direction Preset Snapping
  const snapTo = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    onChange({
      dx: parseFloat(Math.cos(rad).toFixed(4)),
      dy: parseFloat(Math.sin(rad).toFixed(4)),
      angle,
    });
  };

  // Get human friendly label for direction
  const getDirectionName = (deg: number) => {
    if (deg >= 338 || deg < 23) return "Left → Right";
    if (deg >= 23 && deg < 68) return "Diag Down-Right";
    if (deg >= 68 && deg < 113) return "Up → Down";
    if (deg >= 113 && deg < 158) return "Diag Down-Left";
    if (deg >= 158 && deg < 203) return "Right → Left";
    if (deg >= 203 && deg < 248) return "Diag Up-Left";
    if (deg >= 248 && deg < 293) return "Down → Up";
    return "Diag Up-Right";
  };

  return (
    <div className="flex flex-col gap-3 p-3 bg-black/40 border border-[#262626] rounded">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-mono font-bold text-stone-450 uppercase tracking-widest">REVEAL DIRECTION</label>
        <span className="text-[10px] font-mono font-bold text-[#00f0ff] px-2 py-0.5 bg-[#00f0ff]/10 rounded border border-[#00f0ff]/20 uppercase">
          {value.angle}° ({getDirectionName(value.angle)})
        </span>
      </div>

      <div className="flex items-center justify-center gap-6 py-2">
        {/* SVG Direction Dial */}
        <div className="relative select-none">
          <svg
            ref={containerRef}
            onMouseDown={handleMouseDown}
            className="w-28 h-28 cursor-crosshair overflow-visible text-[#262626]"
            viewBox="0 0 100 100"
          >
            {/* Outer dial ring */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              className="fill-black stroke-[#262626]"
              strokeWidth="1.5"
            />
            {/* Inner subtle concentric circles */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS * 0.6}
              className="fill-none stroke-[#262626]/40"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS * 0.3}
              className="fill-none stroke-[#262626]/20"
              strokeWidth="1"
            />

            {/* Horizontal Axis Line */}
            <line
              x1={CENTER - RADIUS}
              y1={CENTER}
              x2={CENTER + RADIUS}
              y2={CENTER}
              className="stroke-[#262626]"
              strokeWidth="0.75"
              strokeDasharray="2 1"
            />
            {/* Vertical Axis Line */}
            <line
              x1={CENTER}
              y1={CENTER - RADIUS}
              x2={CENTER}
              y2={CENTER + RADIUS}
              className="stroke-[#262626]"
              strokeWidth="0.75"
              strokeDasharray="2 1"
            />

            {/* Diagonal Assist Marks (45 deg) */}
            <line
              x1={CENTER - RADIUS * 0.707}
              y1={CENTER - RADIUS * 0.707}
              x2={CENTER + RADIUS * 0.707}
              y2={CENTER + RADIUS * 0.707}
              className="stroke-[#262626]/20"
              strokeWidth="0.5"
            />
            <line
              x1={CENTER - RADIUS * 0.707}
              y1={CENTER + RADIUS * 0.707}
              x2={CENTER + RADIUS * 0.707}
              y2={CENTER - RADIUS * 0.707}
              className="stroke-[#262626]/20"
              strokeWidth="0.5"
            />

            {/* Main direction indicator vector line */}
            <line
              x1={CENTER}
              y1={CENTER}
              x2={handleX}
              y2={handleY}
              className="stroke-[#00f0ff]"
              strokeWidth="2"
            />

            {/* Center anchor pin */}
            <circle cx={CENTER} cy={CENTER} r="3" className="fill-white" />

            {/* Interactive draggable knob/handle */}
            <g className="cursor-pointer">
              <circle
                cx={handleX}
                cy={handleY}
                r="7"
                className="fill-[#ff007f] stroke-white hover:fill-[#ff3399] transition-colors shadow-md"
                strokeWidth="1.5"
              />
              <circle
                cx={handleX}
                cy={handleY}
                r="2"
                className="fill-black"
              />
            </g>
          </svg>
        </div>

        {/* Snap Buttons Grid */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-mono font-bold text-stone-500 tracking-widest uppercase mb-0.5 text-center">SNAP SNAP</span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => snapTo(0)}
              className={`p-1.5 rounded bg-[#121212] border flex flex-col items-center justify-center gap-0.5 transition-all text-[9.5px] font-mono leading-none font-bold uppercase cursor-pointer ${
                value.angle === 0
                  ? "border-[#00f0ff]/50 bg-[#00f0ff]/10 text-[#00f0ff]"
                  : "border-[#262626] text-stone-500 hover:text-stone-300"
              }`}
              title="Left to Right (0°)"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>Right</span>
            </button>
            <button
              onClick={() => snapTo(180)}
              className={`p-1.5 rounded bg-[#121212] border flex flex-col items-center justify-center gap-0.5 transition-all text-[9.5px] font-mono leading-none font-bold uppercase cursor-pointer ${
                value.angle === 180
                  ? "border-[#00f0ff]/50 bg-[#00f0ff]/10 text-[#00f0ff]"
                  : "border-[#262626] text-stone-500 hover:text-stone-300"
              }`}
              title="Right to Left (180°)"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Left</span>
            </button>
            <button
              onClick={() => snapTo(90)}
              className={`p-1.5 rounded bg-[#121212] border flex flex-col items-center justify-center gap-0.5 transition-all text-[9.5px] font-mono leading-none font-bold uppercase cursor-pointer ${
                value.angle === 90
                  ? "border-[#00f0ff]/50 bg-[#00f0ff]/10 text-[#00f0ff]"
                  : "border-[#262626] text-stone-500 hover:text-stone-300"
              }`}
              title="Up to Down (90°)"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Down</span>
            </button>
            <button
              onClick={() => snapTo(270)}
              className={`p-1.5 rounded bg-[#121212] border flex flex-col items-center justify-center gap-0.5 transition-all text-[9.5px] font-mono leading-none font-bold uppercase cursor-pointer ${
                value.angle === 270
                  ? "border-[#00f0ff]/50 bg-[#00f0ff]/10 text-[#00f0ff]"
                  : "border-[#262626] text-stone-500 hover:text-stone-300"
              }`}
              title="Down to Up (270°)"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>Up</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
