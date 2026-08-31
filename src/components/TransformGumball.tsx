/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { RotateCw, Maximize2, Move, RotateCcw, X, Check, Sliders, ArrowRight, ArrowLeft, ArrowUp, ArrowDown } from "lucide-react";
import { ImageTransform } from "../types";

interface TransformGumballProps {
  transform: ImageTransform;
  bbox: { x: number; y: number; width: number; height: number };
  viewBox: { x: number; y: number; width: number; height: number };
  stageRect: DOMRect | null;
  onUpdateTransform: (t: ImageTransform) => void;
  onFit: () => void;
  onFill: () => void;
  onReset: () => void;
  onRemove: () => void;
  syncToAll: boolean;
  onToggleSyncToAll: () => void;
  onScaleRightDelta?: (deltaPercent: number) => void;
}

export function TransformGumball({
  transform,
  bbox,
  viewBox,
  stageRect,
  onUpdateTransform,
  onFit,
  onFill,
  onReset,
  onRemove,
  syncToAll,
  onToggleSyncToAll,
  onScaleRightDelta,
}: TransformGumballProps) {
  // Active dragging mode
  const [activeDrag, setActiveDrag] = useState<
    | "translate-free"
    | "translate-x"
    | "translate-y"
    | "rotate"
    | "scale"
    | "scale-right"
    | "scale-left"
    | "scale-top"
    | "scale-bottom"
    | null
  >(null);

  const [activeScaleCorner, setActiveScaleCorner] = useState<string | null>(null);
  const [liveTooltip, setLiveTooltip] = useState<string | null>(null);

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    startX: number;
    startY: number;
    startScale: number;
    startScaleX: number;
    startScaleY: number;
    startRotation: number;
    centerScreenX: number;
    centerScreenY: number;
    initialDistance: number;
    initialAngle: number;
  } | null>(null);

  // Center of the bounding box in SVG units
  const cx = bbox.x + bbox.width / 2 + (transform.x || 0);
  const cy = bbox.y + bbox.height / 2 + (transform.y || 0);
  const scale = transform.scale || 1.0;
  const scaleX = transform.scaleX !== undefined ? transform.scaleX : 1.0;
  const scaleY = transform.scaleY !== undefined ? transform.scaleY : 1.0;
  const rotation = transform.rotation || 0;

  // Compute scaled bounding box half-dimensions
  const halfW = (bbox.width / 2) * scale * scaleX;
  const halfH = (bbox.height / 2) * scale * scaleY;

  // Radii and sizes in SVG units (scaled appropriately for active zoom/viewBox)
  const unitFactor = Math.max(1, viewBox.width / 500);
  const axisLength = Math.max(45 * unitFactor, Math.min(bbox.width, bbox.height) * 0.45);
  const rotateRadius = Math.max(38 * unitFactor, Math.min(bbox.width, bbox.height) * 0.38);
  const handleRadius = 6 * unitFactor;
  const cornerSize = 10 * unitFactor;
  const edgeHandleW = 14 * unitFactor;
  const edgeHandleH = 10 * unitFactor;

  // Window global pointer move and up listeners while dragging
  useEffect(() => {
    if (!activeDrag || !dragStartRef.current) return;

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      const start = dragStartRef.current;
      if (!start) return;

      const dxClient = e.clientX - start.clientX;
      const dyClient = e.clientY - start.clientY;

      // Convert client pixels to SVG distance
      const svgScale = stageRect && stageRect.width > 0 ? viewBox.width / stageRect.width : 1;
      const svgDx = dxClient * svgScale;
      const svgDy = dyClient * svgScale;

      const rotAngleRad = (start.startRotation * Math.PI) / 180;
      const cosR = Math.cos(rotAngleRad);
      const sinR = Math.sin(rotAngleRad);

      if (activeDrag === "translate-free") {
        const nextX = Math.round(start.startX + svgDx);
        const nextY = Math.round(start.startY + svgDy);
        onUpdateTransform({
          ...transform,
          x: nextX,
          y: nextY,
        });
        setLiveTooltip(`Offset: (${nextX > 0 ? "+" : ""}${nextX}px, ${nextY > 0 ? "+" : ""}${nextY}px)`);
      } else if (activeDrag === "translate-x") {
        const nextX = Math.round(start.startX + svgDx);
        onUpdateTransform({
          ...transform,
          x: nextX,
        });
        setLiveTooltip(`X: ${nextX > 0 ? "+" : ""}${nextX}px`);
      } else if (activeDrag === "translate-y") {
        const nextY = Math.round(start.startY + svgDy);
        onUpdateTransform({
          ...transform,
          y: nextY,
        });
        setLiveTooltip(`Y: ${nextY > 0 ? "+" : ""}${nextY}px`);
      } else if (activeDrag === "rotate") {
        const curDx = e.clientX - start.centerScreenX;
        const curDy = e.clientY - start.centerScreenY;
        const currentAngleRad = Math.atan2(curDy, curDx);
        const currentAngleDeg = (currentAngleRad * 180) / Math.PI;

        let deltaAngle = currentAngleDeg - start.initialAngle;
        let nextAngle = Math.round(start.startRotation + deltaAngle);

        // Snap to 15° if Shift is held
        if (e.shiftKey) {
          nextAngle = Math.round(nextAngle / 15) * 15;
        }

        // Normalize to -180 .. 180
        while (nextAngle > 180) nextAngle -= 360;
        while (nextAngle < -180) nextAngle += 360;

        onUpdateTransform({
          ...transform,
          rotation: nextAngle,
        });
        setLiveTooltip(`Rotate: ${nextAngle}° ${e.shiftKey ? "(15° Snap)" : ""}`);
      } else if (activeDrag === "scale") {
        // Uniform corner scaling
        const curDx = e.clientX - start.centerScreenX;
        const curDy = e.clientY - start.centerScreenY;
        const currentDist = Math.sqrt(curDx * curDx + curDy * curDy);

        if (start.initialDistance > 0) {
          const ratio = currentDist / start.initialDistance;
          let nextScale = Math.round(start.startScale * ratio * 100) / 100;
          nextScale = Math.max(0.1, Math.min(5.0, nextScale));

          onUpdateTransform({
            ...transform,
            scale: nextScale,
          });
          setLiveTooltip(`Scale (Uniform): ${Math.round(nextScale * 100)}%`);
        }
      } else if (activeDrag === "scale-right") {
        // SCALE TO RIGHT ONLY (Anchor left edge firmly in place)
        const localDx = svgDx * cosR + svgDy * sinR;
        const startW = bbox.width * start.startScale * start.startScaleX;
        const newW = Math.max(5, startW + localDx);
        let nextScaleX = Math.round((start.startScaleX * (newW / startW)) * 100) / 100;
        nextScaleX = Math.max(0.05, Math.min(5.0, nextScaleX));

        const deltaW = (nextScaleX - start.startScaleX) * bbox.width * start.startScale;
        const shiftX = (deltaW / 2) * cosR;
        const shiftY = (deltaW / 2) * sinR;

        onUpdateTransform({
          ...transform,
          scaleX: nextScaleX,
          x: Math.round(start.startX + shiftX),
          y: Math.round(start.startY + shiftY),
        });
        setLiveTooltip(`Scale Right: ${Math.round(nextScaleX * 100)}% (Left Anchored)`);
      } else if (activeDrag === "scale-left") {
        // SCALE TO LEFT ONLY (Anchor right edge firmly in place)
        const localDx = svgDx * cosR + svgDy * sinR;
        const startW = bbox.width * start.startScale * start.startScaleX;
        const newW = Math.max(5, startW - localDx);
        let nextScaleX = Math.round((start.startScaleX * (newW / startW)) * 100) / 100;
        nextScaleX = Math.max(0.05, Math.min(5.0, nextScaleX));

        const deltaW = (nextScaleX - start.startScaleX) * bbox.width * start.startScale;
        const shiftX = -(deltaW / 2) * cosR;
        const shiftY = -(deltaW / 2) * sinR;

        onUpdateTransform({
          ...transform,
          scaleX: nextScaleX,
          x: Math.round(start.startX + shiftX),
          y: Math.round(start.startY + shiftY),
        });
        setLiveTooltip(`Scale Left: ${Math.round(nextScaleX * 100)}% (Right Anchored)`);
      } else if (activeDrag === "scale-top") {
        // SCALE TOP ONLY (Anchor bottom edge)
        const localDy = -svgDx * sinR + svgDy * cosR;
        const startH = bbox.height * start.startScale * start.startScaleY;
        const newH = Math.max(5, startH - localDy);
        let nextScaleY = Math.round((start.startScaleY * (newH / startH)) * 100) / 100;
        nextScaleY = Math.max(0.05, Math.min(5.0, nextScaleY));

        const deltaH = (nextScaleY - start.startScaleY) * bbox.height * start.startScale;
        const shiftX = (deltaH / 2) * sinR;
        const shiftY = -(deltaH / 2) * cosR;

        onUpdateTransform({
          ...transform,
          scaleY: nextScaleY,
          x: Math.round(start.startX + shiftX),
          y: Math.round(start.startY + shiftY),
        });
        setLiveTooltip(`Scale Top: ${Math.round(nextScaleY * 100)}% (Bottom Anchored)`);
      } else if (activeDrag === "scale-bottom") {
        // SCALE BOTTOM ONLY (Anchor top edge)
        const localDy = -svgDx * sinR + svgDy * cosR;
        const startH = bbox.height * start.startScale * start.startScaleY;
        const newH = Math.max(5, startH + localDy);
        let nextScaleY = Math.round((start.startScaleY * (newH / startH)) * 100) / 100;
        nextScaleY = Math.max(0.05, Math.min(5.0, nextScaleY));

        const deltaH = (nextScaleY - start.startScaleY) * bbox.height * start.startScale;
        const shiftX = -(deltaH / 2) * sinR;
        const shiftY = (deltaH / 2) * cosR;

        onUpdateTransform({
          ...transform,
          scaleY: nextScaleY,
          x: Math.round(start.startX + shiftX),
          y: Math.round(start.startY + shiftY),
        });
        setLiveTooltip(`Scale Bottom: ${Math.round(nextScaleY * 100)}% (Top Anchored)`);
      }
    };

    const handlePointerUp = () => {
      setActiveDrag(null);
      setActiveScaleCorner(null);
      setLiveTooltip(null);
      dragStartRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeDrag, transform, onUpdateTransform, stageRect, viewBox.width, bbox.width, bbox.height]);

  // Helper to start dragging
  const handleStartDrag = (
    mode:
      | "translate-free"
      | "translate-x"
      | "translate-y"
      | "rotate"
      | "scale"
      | "scale-right"
      | "scale-left"
      | "scale-top"
      | "scale-bottom",
    e: React.PointerEvent,
    cornerName?: string
  ) => {
    e.stopPropagation();
    e.preventDefault();

    // Calculate center in screen coordinates
    let screenCx = e.clientX;
    let screenCy = e.clientY;

    if (stageRect) {
      const relX = (cx - viewBox.x) / viewBox.width;
      const relY = (cy - viewBox.y) / viewBox.height;
      screenCx = stageRect.left + relX * stageRect.width;
      screenCy = stageRect.top + relY * stageRect.height;
    }

    const curDx = e.clientX - screenCx;
    const curDy = e.clientY - screenCy;
    const initDist = Math.sqrt(curDx * curDx + curDy * curDy);
    const initAngle = (Math.atan2(curDy, curDx) * 180) / Math.PI;

    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: transform.x || 0,
      startY: transform.y || 0,
      startScale: transform.scale || 1.0,
      startScaleX: transform.scaleX !== undefined ? transform.scaleX : 1.0,
      startScaleY: transform.scaleY !== undefined ? transform.scaleY : 1.0,
      startRotation: transform.rotation || 0,
      centerScreenX: screenCx,
      centerScreenY: screenCy,
      initialDistance: initDist > 0 ? initDist : 1,
      initialAngle: initAngle,
    };

    setActiveDrag(mode);
    if (cornerName) setActiveScaleCorner(cornerName);
  };

  // Rotation handle position on the rotation ring (placed at top 90° or 0°)
  const rotAngleRad = (rotation * Math.PI) / 180;
  const rotHandleX = cx + rotateRadius * Math.cos(rotAngleRad - Math.PI / 2);
  const rotHandleY = cy + rotateRadius * Math.sin(rotAngleRad - Math.PI / 2);

  // 4 Corner positions rotated around center (cx, cy)
  const corners = [
    { name: "nw", x: -halfW, y: -halfH, cursor: "nwse-resize" },
    { name: "ne", x: halfW, y: -halfH, cursor: "nesw-resize" },
    { name: "se", x: halfW, y: halfH, cursor: "nwse-resize" },
    { name: "sw", x: -halfW, y: halfH, cursor: "nesw-resize" },
  ].map((c) => {
    const rx = c.x * Math.cos(rotAngleRad) - c.y * Math.sin(rotAngleRad);
    const ry = c.x * Math.sin(rotAngleRad) + c.y * Math.cos(rotAngleRad);
    return {
      ...c,
      worldX: cx + rx,
      worldY: cy + ry,
    };
  });

  // 4 Edge handles for direct directional scaling (Right, Left, Top, Bottom)
  const edgeHandles = [
    {
      name: "e",
      label: "RIGHT",
      mode: "scale-right" as const,
      x: halfW,
      y: 0,
      cursor: "ew-resize",
      isPrimaryRight: true,
    },
    {
      name: "w",
      label: "LEFT",
      mode: "scale-left" as const,
      x: -halfW,
      y: 0,
      cursor: "ew-resize",
      isPrimaryRight: false,
    },
    {
      name: "n",
      label: "TOP",
      mode: "scale-top" as const,
      x: 0,
      y: -halfH,
      cursor: "ns-resize",
      isPrimaryRight: false,
    },
    {
      name: "s",
      label: "BOTTOM",
      mode: "scale-bottom" as const,
      x: 0,
      y: halfH,
      cursor: "ns-resize",
      isPrimaryRight: false,
    },
  ].map((edge) => {
    const rx = edge.x * Math.cos(rotAngleRad) - edge.y * Math.sin(rotAngleRad);
    const ry = edge.x * Math.sin(rotAngleRad) + edge.y * Math.cos(rotAngleRad);
    return {
      ...edge,
      worldX: cx + rx,
      worldY: cy + ry,
    };
  });

  return (
    <g className="gumball-gizmo select-none font-mono">
      {/* 1. Rotated Bounding Box Outline */}
      <g transform={`translate(${cx}, ${cy}) rotate(${rotation})`}>
        <rect
          x={-halfW}
          y={-halfH}
          width={halfW * 2}
          height={halfH * 2}
          fill="rgba(0, 240, 255, 0.05)"
          stroke="#00f0ff"
          strokeWidth={Math.max(1.5, viewBox.width / 350)}
          strokeDasharray="4 3"
          onPointerDown={(e) => handleStartDrag("translate-free", e)}
          className="cursor-move hover:fill-[rgba(0,240,255,0.12)] transition-colors"
        />
      </g>

      {/* 2. Edge Scaling Handles (RIGHT, LEFT, TOP, BOTTOM) */}
      {edgeHandles.map((edge) => (
        <g
          key={edge.name}
          transform={`translate(${edge.worldX}, ${edge.worldY}) rotate(${rotation})`}
          onPointerDown={(e) => handleStartDrag(edge.mode, e)}
          className="cursor-pointer group/edge"
        >
          {edge.isPrimaryRight ? (
            /* Special Prominent "SCALE RIGHT" Handle with Glowing Badge */
            <g>
              {/* Pulsing ring for right handle */}
              <rect
                x={-edgeHandleW * 0.6}
                y={-edgeHandleH}
                width={edgeHandleW * 1.2}
                height={edgeHandleH * 2}
                rx={3 * unitFactor}
                fill="#00f0ff"
                stroke="#ffffff"
                strokeWidth={2}
                className="filter drop-shadow-[0_0_8px_rgba(0,240,255,0.9)] hover:scale-125 transition-transform"
              />
              {/* Right arrow icon */}
              <path
                d={`M ${-2 * unitFactor} ${-3 * unitFactor} L ${2 * unitFactor} 0 L ${-2 * unitFactor} ${3 * unitFactor}`}
                fill="none"
                stroke="#000000"
                strokeWidth={1.8 * unitFactor}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Text Tag: RIGHT */}
              <text
                x={edgeHandleW * 1.1}
                y={3 * unitFactor}
                fill="#00f0ff"
                fontSize={8.5 * unitFactor}
                fontWeight="bold"
                className="pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              >
                SCALE RIGHT →
              </text>
            </g>
          ) : (
            /* Standard Edge Handle */
            <rect
              x={edge.name === "w" ? -edgeHandleW / 2 : -edgeHandleW / 2}
              y={-edgeHandleH / 2}
              width={edge.name === "n" || edge.name === "s" ? edgeHandleW * 1.5 : edgeHandleW}
              height={edge.name === "n" || edge.name === "s" ? edgeHandleH : edgeHandleH * 1.5}
              rx={2 * unitFactor}
              fill="#00f0ff"
              stroke="#000"
              strokeWidth={1.5}
              className="hover:scale-125 hover:fill-white transition-transform"
            />
          )}
        </g>
      ))}

      {/* 3. Corner Scaling Handles (NW, NE, SE, SW) */}
      {corners.map((corner) => (
        <rect
          key={corner.name}
          x={corner.worldX - cornerSize / 2}
          y={corner.worldY - cornerSize / 2}
          width={cornerSize}
          height={cornerSize}
          fill="#ffe600"
          stroke="#000"
          strokeWidth={1.5}
          className="cursor-nwse-resize hover:scale-125 transition-transform"
          onPointerDown={(e) => handleStartDrag("scale", e, corner.name)}
        />
      ))}

      {/* 4. Circular Rotation Arc & Ring */}
      <circle
        cx={cx}
        cy={cy}
        r={rotateRadius}
        fill="none"
        stroke="rgba(255, 0, 127, 0.6)"
        strokeWidth={Math.max(2, viewBox.width / 260)}
        strokeDasharray="5 3"
        className="pointer-events-none"
      />

      {/* Rotation Track Handle Line from center to knob */}
      <line
        x1={cx}
        y1={cy}
        x2={rotHandleX}
        y2={rotHandleY}
        stroke="#ff007f"
        strokeWidth={Math.max(1.5, viewBox.width / 320)}
        strokeDasharray="2 2"
        className="pointer-events-none"
      />

      {/* Interactive Rotation Knob / Handle */}
      <g
        transform={`translate(${rotHandleX}, ${rotHandleY})`}
        onPointerDown={(e) => handleStartDrag("rotate", e)}
        className="cursor-grab active:cursor-grabbing group/rot"
      >
        <circle
          cx={0}
          cy={0}
          r={handleRadius * 1.3}
          fill="#ff007f"
          stroke="#ffffff"
          strokeWidth={2}
          className="group-hover/rot:scale-125 transition-transform shadow-lg filter drop-shadow-[0_0_6px_rgba(255,0,127,0.8)]"
        />
      </g>

      {/* 5. Translation X-Axis Arrow (Cyan Arrow) */}
      <g
        onPointerDown={(e) => handleStartDrag("translate-x", e)}
        className="cursor-ew-resize group/axisx"
      >
        {/* Invisible wider hit area */}
        <line
          x1={cx}
          y1={cy}
          x2={cx + axisLength}
          y2={cy}
          stroke="transparent"
          strokeWidth={handleRadius * 2.5}
        />
        <line
          x1={cx}
          y1={cy}
          x2={cx + axisLength}
          y2={cy}
          stroke="#00f0ff"
          strokeWidth={Math.max(2.5, viewBox.width / 220)}
          className="group-hover/axisx:stroke-white transition-colors"
        />
        {/* Arrow head */}
        <polygon
          points={`${cx + axisLength},${cy - handleRadius * 0.9} ${cx + axisLength + handleRadius * 1.5},${cy} ${cx + axisLength},${cy + handleRadius * 0.9}`}
          fill="#00f0ff"
          stroke="#000"
          strokeWidth={1}
          className="group-hover/axisx:fill-white"
        />
      </g>

      {/* 6. Translation Y-Axis Arrow (Pink Arrow) */}
      <g
        onPointerDown={(e) => handleStartDrag("translate-y", e)}
        className="cursor-ns-resize group/axisy"
      >
        {/* Invisible wider hit area */}
        <line
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy + axisLength}
          stroke="transparent"
          strokeWidth={handleRadius * 2.5}
        />
        <line
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy + axisLength}
          stroke="#ff007f"
          strokeWidth={Math.max(2.5, viewBox.width / 220)}
          className="group-hover/axisy:stroke-white transition-colors"
        />
        {/* Arrow head */}
        <polygon
          points={`${cx - handleRadius * 0.9},${cy + axisLength} ${cx},${cy + axisLength + handleRadius * 1.5} ${cx + handleRadius * 0.9},${cy + axisLength}`}
          fill="#ff007f"
          stroke="#000"
          strokeWidth={1}
          className="group-hover/axisy:fill-white"
        />
      </g>

      {/* 7. Center Origin Disc (Free 2D Translation) */}
      <g
        transform={`translate(${cx}, ${cy})`}
        onPointerDown={(e) => handleStartDrag("translate-free", e)}
        className="cursor-move group/center"
      >
        <circle
          cx={0}
          cy={0}
          r={handleRadius * 1.1}
          fill="#ffe600"
          stroke="#000"
          strokeWidth={2}
          className="group-hover/center:scale-125 transition-transform"
        />
        <circle cx={0} cy={0} r={handleRadius * 0.4} fill="#000" />
      </g>

      {/* 8. Live Action Tooltip Badge */}
      {liveTooltip && (
        <g transform={`translate(${cx}, ${cy - halfH - 24 * unitFactor})`}>
          <rect
            x={-75 * unitFactor}
            y={-12 * unitFactor}
            width={150 * unitFactor}
            height={22 * unitFactor}
            fill="#000000"
            stroke="#00f0ff"
            strokeWidth={1.5}
            rx={2}
          />
          <text
            x={0}
            y={3 * unitFactor}
            fill="#00f0ff"
            fontSize={10.5 * unitFactor}
            fontWeight="bold"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {liveTooltip}
          </text>
        </g>
      )}

      {/* 9. Floating Quick Action Controls Bar above Gizmo */}
      <g transform={`translate(${cx}, ${cy - Math.max(halfH, axisLength) - 20 * unitFactor})`}>
        {/* Quick Action Bubble Background */}
        <rect
          x={-135 * unitFactor}
          y={-14 * unitFactor}
          width={270 * unitFactor}
          height={28 * unitFactor}
          fill="rgba(10, 10, 10, 0.95)"
          stroke="#333"
          strokeWidth={1}
          rx={4}
        />
        {/* Quick buttons */}
        <text
          x={-125 * unitFactor}
          y={2 * unitFactor}
          fill="#888"
          fontSize={8 * unitFactor}
          fontWeight="bold"
        >
          GUMBALL:
        </text>

        {/* SCALE RIGHT ONLY BUTTON */}
        <text
          x={-80 * unitFactor}
          y={2 * unitFactor}
          fill="#00f0ff"
          fontSize={8.5 * unitFactor}
          fontWeight="bold"
          className="cursor-pointer hover:fill-white"
          onClick={() => onScaleRightDelta?.(0.1)}
        >
          [RIGHT +10%]
        </text>

        <text
          x={-20 * unitFactor}
          y={2 * unitFactor}
          fill="#00f0ff"
          fontSize={8.5 * unitFactor}
          fontWeight="bold"
          className="cursor-pointer hover:fill-white"
          onClick={onFit}
        >
          [FIT]
        </text>
        <text
          x={12 * unitFactor}
          y={2 * unitFactor}
          fill="#00ff66"
          fontSize={8.5 * unitFactor}
          fontWeight="bold"
          className="cursor-pointer hover:fill-white"
          onClick={onFill}
        >
          [FILL]
        </text>
        <text
          x={48 * unitFactor}
          y={2 * unitFactor}
          fill="#ffe600"
          fontSize={8.5 * unitFactor}
          fontWeight="bold"
          className="cursor-pointer hover:fill-white"
          onClick={onReset}
        >
          [RESET]
        </text>
        <text
          x={95 * unitFactor}
          y={2 * unitFactor}
          fill="#ff007f"
          fontSize={8.5 * unitFactor}
          fontWeight="bold"
          className="cursor-pointer hover:fill-white"
          onClick={onRemove}
        >
          [✕]
        </text>
      </g>
    </g>
  );
}

