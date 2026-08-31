/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Move,
  MousePointer,
  Info,
  Layers,
  Sparkles,
  Film,
  Compass,
  ArrowRight,
  Check,
  Scissors,
  Eye,
  EyeOff,
  Grid,
  Sliders,
  Play,
  RotateCcw,
  Crop,
  Square,
} from "lucide-react";
import { SVGZoneInfo, ZoneSettings, BaseDocSize } from "../types";
import { generateLinesData, getShapeGeometry, isPointInPolygon } from "../utils/slicing";
import { sortZonesByLayerOrder, isZoneSolid, calculatePolygonArea, ZoneGeometry } from "../utils/layerHierarchy";

interface SvgCanvasProps {
  svgContent: string | null;
  zones: SVGZoneInfo[];
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string | null) => void;
  zoneSettings: Record<string, ZoneSettings>;
  baseDocSize?: BaseDocSize;
  isSlicingPreviewActive?: boolean;
  setIsSlicingPreviewActive?: (val: boolean) => void;
  slicingPhase?: number;
  setSlicingPhase?: (val: number) => void;
  slicingScale?: number;
  setSlicingScale?: (val: number) => void;
  slicingMode?: "cutting" | "bars" | "wireframe" | "both";
  setSlicingMode?: (val: "cutting" | "bars" | "wireframe" | "both") => void;
  hiddenZoneIds?: Record<string, boolean>;
  onOpenArtworkStudio?: (zoneId: string) => void;
  onOpenStitchedPreview?: () => void;
  onUpdateZoneSettings?: (settings: ZoneSettings) => void;
  onUpdateSvgContent?: (newSvgContent: string) => void;
  showStatus?: (msg: string, type?: "success" | "error" | "info") => void;
  onRenameZone?: (zoneId: string, newName: string) => void;
  onChangeZoneFrames?: (zoneId: string, count: number) => void;
}

export function SvgCanvas({
  svgContent,
  zones,
  selectedZoneId,
  onSelectZone,
  zoneSettings,
  baseDocSize = { label: "A4 (210 × 297 mm)", widthInches: 8.27, heightInches: 11.69, unit: "mm" },
  isSlicingPreviewActive = true,
  setIsSlicingPreviewActive,
  slicingPhase = 0.0,
  setSlicingPhase,
  slicingScale = 1.0,
  setSlicingScale,
  slicingMode = "wireframe",
  setSlicingMode,
  hiddenZoneIds = {},
  onOpenArtworkStudio,
  onOpenStitchedPreview,
  onUpdateZoneSettings,
  onUpdateSvgContent,
  showStatus,
  onRenameZone,
  onChangeZoneFrames,
}: SvgCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);

  // Viewport State
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Saved Default Viewport State
  const [savedDefaultView, setSavedDefaultView] = useState<{ scale: number; pan: { x: number; y: number } } | null>(() => {
    try {
      const stored = localStorage.getItem("scanimation_default_view");
      if (stored) return JSON.parse(stored);
    } catch {
      // ignore
    }
    return null;
  });

  // Interaction Mode: 'select' | 'pan' | 'vector'
  const [mode, setMode] = useState<"select" | "pan" | "vector">("select");
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);

  // On-screen Vector Drawing State
  const [isDrawingVector, setIsDrawingVector] = useState<boolean>(false);
  const [vectorStart, setVectorStart] = useState<{ x: number; y: number } | null>(null);
  const [vectorCurrent, setVectorCurrent] = useState<{ x: number; y: number } | null>(null);
  const [lastCalculatedAngle, setLastCalculatedAngle] = useState<number | null>(null);

  // Live wireframe animation loop
  const [isAnimatingPhase, setIsAnimatingPhase] = useState<boolean>(false);
  const phaseAnimationRef = useRef<number | null>(null);

  const togglePhaseAnimation = () => {
    if (isAnimatingPhase) {
      if (phaseAnimationRef.current) cancelAnimationFrame(phaseAnimationRef.current);
      setIsAnimatingPhase(false);
    } else {
      setIsAnimatingPhase(true);
      const start = Date.now();
      const run = () => {
        const elapsed = Date.now() - start;
        const newPhase = (elapsed % 3000) / 3000;
        if (setSlicingPhase) {
          setSlicingPhase(newPhase);
        }
        phaseAnimationRef.current = requestAnimationFrame(run);
      };
      phaseAnimationRef.current = requestAnimationFrame(run);
    }
  };

  useEffect(() => {
    return () => {
      if (phaseAnimationRef.current) cancelAnimationFrame(phaseAnimationRef.current);
    };
  }, []);

  // Auto-fit all curves to outer edges of viewport when SVG or zones load
  useEffect(() => {
    if (svgContent) {
      const timer = setTimeout(() => {
        handleFitToAllCurves();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [svgContent, zones.length]);

  // Keep preview selection aligned with active animated zones only.
  useEffect(() => {
    if (!selectedZoneId) return;

    const settings = zoneSettings[selectedZoneId];
    const isInactive =
      !!hiddenZoneIds[selectedZoneId] ||
      !settings ||
      !!settings.isSolid ||
      (settings.frameCount !== undefined && settings.frameCount <= 1);

    if (isInactive) {
      setHoveredZoneId((current) => (current === selectedZoneId ? null : current));
      onSelectZone(null);
    }
  }, [selectedZoneId, hiddenZoneIds, zoneSettings, onSelectZone]);

  // Live Scanimation Grating & Wireframe Grid Slices Rendering Overlay
  useEffect(() => {
    if (!svgWrapperRef.current) return;

    // Remove legacy grating overlays first
    const legacyOverlay = svgWrapperRef.current.querySelector("#scanimation-live-overlay");
    if (legacyOverlay) {
      legacyOverlay.remove();
    }

    const svgEl = svgWrapperRef.current.querySelector("svg");
    if (!svgEl) return;

    try {
      // Find minimum frame count of active zones to establish baseline color coding
      const activeZoneSettings = zones
        .filter((z) => !hiddenZoneIds[z.id])
        .map((z) => zoneSettings[z.id]?.frameCount || 6);
      const minFrameCount = activeZoneSettings.length > 0 ? Math.min(...activeZoneSettings) : 2;

      // Color code shapes based on their frame counts of the zones
      zones.forEach((zone) => {
        const targetShape = svgEl.querySelector(`[data-zone-id="${zone.id}"]`);
        if (!targetShape) return;

        const settings = zoneSettings[zone.id];
        const name = settings?.zoneName || zone.defaultName;
        const isRect1 =
          zone.defaultName === "Rect #1" ||
          name === "Rect #1" ||
          (zone.tagName === "rect" && zone.id === "zone-0");

        if (isRect1) {
          targetShape.setAttribute("opacity", "0.0");
          targetShape.setAttribute("style", "display: none; pointer-events: none;");
          return;
        }

        const isHidden = !!hiddenZoneIds[zone.id];
        const isSolidForSelection =
          !!settings?.isSolid ||
          (settings?.frameCount !== undefined && settings.frameCount <= 1);

        if (isHidden) {
          targetShape.setAttribute("opacity", "0.08");
          targetShape.setAttribute("pointer-events", "none");
          return;
        } else {
          targetShape.setAttribute("opacity", "1");
        }

        if (!settings) {
          targetShape.setAttribute("pointer-events", "none");
          return;
        }

        // Hidden and solid/0-1 frame zones must not block clicks from reaching
        // active animated zones underneath them in preview/select mode.
        targetShape.setAttribute("pointer-events", isSolidForSelection ? "none" : "auto");

        const fc = settings.frameCount || 6;
        const step = fc - minFrameCount;

        // Establish matching HSL spectrum where lightness drops as frameCount increases
        const lightness = Math.max(12, 55 - step * 6);
        const zoneColor = `hsl(195, 90%, ${lightness}%)`;
        const zoneFillColor = `hsla(195, 90%, ${lightness}%, 0.18)`;

        // Color the original canvas elements to match each other by frame count
        targetShape.setAttribute("stroke", zone.id === selectedZoneId ? "#00f0ff" : zoneColor);
        targetShape.setAttribute("fill", zoneFillColor);
        targetShape.setAttribute("stroke-width", zone.id === selectedZoneId ? "3" : "1.5");
      });

      // If slicing engine is not active, gracefully stop here
      if (!isSlicingPreviewActive) return;

      // Create main vector slices group
      const overlayGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      overlayGroup.setAttribute("id", "scanimation-live-overlay");
      overlayGroup.setAttribute("style", "pointer-events: none;");

      const defsBlock = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      overlayGroup.appendChild(defsBlock);

      // Extract geometries for all parsed zones and sort by physical layer hierarchy (solid/enclosing base first, island curves on top)
      const geometryMap: Record<string, ZoneGeometry> = {};
      zones.forEach((zone) => {
        const targetShape = svgEl.querySelector(`[data-zone-id="${zone.id}"]`);
        if (targetShape) {
          geometryMap[zone.id] = getShapeGeometry(targetShape as SVGElement);
        }
      });

      const sortedZones = sortZonesByLayerOrder(zones, geometryMap, zoneSettings);

      // Loop over every parsed zone in bottom-to-top layer order
      sortedZones.forEach((zone) => {
        const targetShape = svgEl.querySelector(`[data-zone-id="${zone.id}"]`);
        if (!targetShape) return;

        const settings = zoneSettings[zone.id];
        const name = settings?.zoneName || zone.defaultName;
        const isRect1 =
          zone.defaultName === "Rect #1" ||
          name === "Rect #1" ||
          (zone.tagName === "rect" && zone.id === "zone-0");
        if (isRect1) return; // Ignore Rect #1 for live slices

        const isHidden = !!hiddenZoneIds[zone.id];
        if (isHidden) return; // Hidden zones bypass slicing

        if (!settings) return;

        const geom = geometryMap[zone.id];
        if (!geom || geom.polygon.length < 3) return;
        const { bbox, polygon } = geom;

        const isSelected = zone.id === selectedZoneId;
        const isSolid = !!settings.isSolid || (settings.frameCount !== undefined && settings.frameCount <= 1);

        // A. SOLID REGION RENDERING (Static Base Layer)
        if (isSolid) {
          const solidGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
          solidGroup.setAttribute("id", `solid-layer-${zone.id}`);

          const solidPoly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
          solidPoly.setAttribute("points", polygon.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
          const solidColor = settings.solidColor || "#000000";
          solidPoly.setAttribute("fill", solidColor);
          solidPoly.setAttribute("fill-opacity", isSelected ? "0.88" : "0.72");
          solidPoly.setAttribute("stroke", isSelected ? "#ff007f" : solidColor);
          solidPoly.setAttribute("stroke-width", isSelected ? "2.2" : "1.0");
          solidGroup.appendChild(solidPoly);

          overlayGroup.appendChild(solidGroup);

          // Annotation for selected solid base
          if (isSelected) {
            const annotGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
            annotGroup.setAttribute("id", `solid-annot-${zone.id}`);

            let cx = 0, cy = 0;
            polygon.forEach((p) => {
              cx += p.x;
              cy += p.y;
            });
            cx /= polygon.length;
            cy /= polygon.length;

            const badgeG = document.createElementNS("http://www.w3.org/2000/svg", "g");
            badgeG.setAttribute("transform", `translate(${bbox.x.toFixed(1)}, ${(bbox.y - 12).toFixed(1)})`);

            const badgeRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            badgeRect.setAttribute("x", "0");
            badgeRect.setAttribute("y", "-10");
            badgeRect.setAttribute("width", "130");
            badgeRect.setAttribute("height", "14");
            badgeRect.setAttribute("fill", "#090d16");
            badgeRect.setAttribute("stroke", "#ff007f");
            badgeRect.setAttribute("stroke-width", "1");
            badgeRect.setAttribute("rx", "2");
            badgeG.appendChild(badgeRect);

            const badgeText = document.createElementNS("http://www.w3.org/2000/svg", "text");
            badgeText.setAttribute("x", "65");
            badgeText.setAttribute("y", "0");
            badgeText.setAttribute("fill", "#ff007f");
            badgeText.setAttribute("font-size", "7.5");
            badgeText.setAttribute("font-weight", "bold");
            badgeText.setAttribute("font-family", "monospace");
            badgeText.setAttribute("text-anchor", "middle");
            badgeText.textContent = `SOLID BASE (${settings.frameCount || 0} FRAMES)`;
            badgeG.appendChild(badgeText);

            annotGroup.appendChild(badgeG);
            overlayGroup.appendChild(annotGroup);
          }
          return;
        }

        // B. ANIMATED MULTI-FRAME SLICES (Renders on top of solid base layers)
        const clipId = `live-clip-${zone.id}`;

        const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
        clipPath.setAttribute("id", clipId);

        // Build exact polygon clipping mask in root coordinates
        const polyEl = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        polyEl.setAttribute("points", polygon.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
        polyEl.setAttribute("fill", "#ffffff");
        polyEl.setAttribute("stroke", "none");

        clipPath.appendChild(polyEl);
        defsBlock.appendChild(clipPath);

        // Clipped lines container
        const clippedGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        clippedGroup.setAttribute("clip-path", `url(#${clipId})`);

        const fc = settings.frameCount || 6;
        const step = fc - minFrameCount;
        const lightness = Math.max(12, 55 - step * 6);
        const zoneColor = `hsl(195, 90%, ${lightness}%)`;

        // 1. RENDER PHYSICAL MASK (if bars or both)
        if (slicingMode === "bars" || slicingMode === "both") {
          const barLinesData = generateLinesData(bbox, settings, slicingScale, slicingPhase, true);
          let d = "";
          barLinesData.lines.forEach((l) => {
            d += `M ${l.x1.toFixed(1)} ${l.y1.toFixed(1)} L ${l.x2.toFixed(1)} ${l.y2.toFixed(1)} `;
          });
          const barPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
          barPath.setAttribute("d", d.trim());
          barPath.setAttribute("stroke", "#020617"); // Dark Slate base for simulation occlusion
          barPath.setAttribute("stroke-width", barLinesData.lineThickness.toFixed(2));
          barPath.setAttribute("stroke-linecap", "butt");
          barPath.setAttribute("opacity", isSelected ? (slicingMode === "both" ? "0.75" : "0.95") : "0.80");
          barPath.setAttribute("fill", "none");
          clippedGroup.appendChild(barPath);
        }

        // 2. RENDER WIREFRAME GRID SLITS (if wireframe, cutting, or both)
        if (slicingMode === "wireframe" || slicingMode === "cutting" || slicingMode === "both") {
          const { lines } = generateLinesData(bbox, settings, slicingScale, slicingPhase, false);

          // Render wireframe grid lines
          let dWire = "";
          lines.forEach((l) => {
            dWire += `M ${l.x1.toFixed(1)} ${l.y1.toFixed(1)} L ${l.x2.toFixed(1)} ${l.y2.toFixed(1)} `;
          });

          const wirePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
          wirePath.setAttribute("d", dWire.trim());
          wirePath.setAttribute("stroke", isSelected ? "#00f0ff" : zoneColor);
          wirePath.setAttribute("stroke-width", isSelected ? "1.6" : "1.0");
          wirePath.setAttribute("stroke-linecap", "round");
          wirePath.setAttribute("fill", "none");
          wirePath.setAttribute("style", isSelected ? "filter: drop-shadow(0 0 3px #00f0ff);" : "");
          clippedGroup.appendChild(wirePath);

          // Render phase tint bands for the selected zone in wireframe mode to show slit frame indices
          if (isSelected && (slicingMode === "wireframe" || slicingMode === "both") && lines.length > 0) {
            lines.forEach((l, idx) => {
              const phaseIdx = idx % fc;
              // Subtle phase color accent line
              const phaseLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
              phaseLine.setAttribute("x1", l.x1.toFixed(1));
              phaseLine.setAttribute("y1", l.y1.toFixed(1));
              phaseLine.setAttribute("x2", l.x2.toFixed(1));
              phaseLine.setAttribute("y2", l.y2.toFixed(1));
              phaseLine.setAttribute("stroke", phaseIdx === 0 ? "#ff007f" : "#00f0ff");
              phaseLine.setAttribute("stroke-width", phaseIdx === 0 ? "2.2" : "1.2");
              phaseLine.setAttribute("stroke-opacity", phaseIdx === 0 ? "0.9" : "0.6");
              clippedGroup.appendChild(phaseLine);
            });
          }
        }

        overlayGroup.appendChild(clippedGroup);

        // 3. UNCLIPPED WIREFRAME ANNOTATIONS & ORIENTATION ARROW (Selected zone only)
        if (isSelected && (slicingMode === "wireframe" || slicingMode === "both")) {
          const annotGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
          annotGroup.setAttribute("id", `wireframe-annot-${zone.id}`);

          // Centroid
          let cx = 0;
          let cy = 0;
          polygon.forEach((p) => {
            cx += p.x;
            cy += p.y;
          });
          cx /= polygon.length;
          cy /= polygon.length;

          // Reveal direction ray passing through centroid
          const angleRad = (settings.revealDirection.angle * Math.PI) / 180;
          const rayLen = Math.min(bbox.width, bbox.height) * 0.45 + 15;
          const rx2 = cx + Math.cos(angleRad) * rayLen;
          const ry2 = cy + Math.sin(angleRad) * rayLen;
          const rx1 = cx - Math.cos(angleRad) * (rayLen * 0.4);
          const ry1 = cy - Math.sin(angleRad) * (rayLen * 0.4);

          // Arrow marker definition in defs
          if (!defsBlock.querySelector("#wireframe-dir-arrow")) {
            const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
            marker.setAttribute("id", "wireframe-dir-arrow");
            marker.setAttribute("markerWidth", "6");
            marker.setAttribute("markerHeight", "6");
            marker.setAttribute("refX", "4");
            marker.setAttribute("refY", "3");
            marker.setAttribute("orient", "auto");
            const arrowPoly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            arrowPoly.setAttribute("points", "0 0, 6 3, 0 6");
            arrowPoly.setAttribute("fill", "#ff007f");
            marker.appendChild(arrowPoly);
            defsBlock.appendChild(marker);
          }

          // Direction ray line
          const dirRay = document.createElementNS("http://www.w3.org/2000/svg", "line");
          dirRay.setAttribute("x1", rx1.toFixed(1));
          dirRay.setAttribute("y1", ry1.toFixed(1));
          dirRay.setAttribute("x2", rx2.toFixed(1));
          dirRay.setAttribute("y2", ry2.toFixed(1));
          dirRay.setAttribute("stroke", "#ff007f");
          dirRay.setAttribute("stroke-width", "2");
          dirRay.setAttribute("stroke-dasharray", "4 2");
          dirRay.setAttribute("marker-end", "url(#wireframe-dir-arrow)");
          dirRay.setAttribute("style", "filter: drop-shadow(0 0 5px rgba(255, 0, 127, 0.8));");
          annotGroup.appendChild(dirRay);

          // Center origin dot
          const centerDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          centerDot.setAttribute("cx", cx.toFixed(1));
          centerDot.setAttribute("cy", cy.toFixed(1));
          centerDot.setAttribute("r", "3");
          centerDot.setAttribute("fill", "#ff007f");
          centerDot.setAttribute("stroke", "#ffffff");
          centerDot.setAttribute("stroke-width", "1");
          annotGroup.appendChild(centerDot);

          // Pitch dimension badge near top-left of bbox
          const badgeG = document.createElementNS("http://www.w3.org/2000/svg", "g");
          badgeG.setAttribute("transform", `translate(${bbox.x.toFixed(1)}, ${(bbox.y - 12).toFixed(1)})`);

          const badgeRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          badgeRect.setAttribute("x", "0");
          badgeRect.setAttribute("y", "-10");
          badgeRect.setAttribute("width", "110");
          badgeRect.setAttribute("height", "14");
          badgeRect.setAttribute("fill", "#090d16");
          badgeRect.setAttribute("stroke", "#00f0ff");
          badgeRect.setAttribute("stroke-width", "1");
          badgeRect.setAttribute("rx", "2");
          badgeG.appendChild(badgeRect);

          const badgeText = document.createElementNS("http://www.w3.org/2000/svg", "text");
          badgeText.setAttribute("x", "55");
          badgeText.setAttribute("y", "0");
          badgeText.setAttribute("fill", "#00f0ff");
          badgeText.setAttribute("font-size", "7.5");
          badgeText.setAttribute("font-weight", "bold");
          badgeText.setAttribute("font-family", "monospace");
          badgeText.setAttribute("text-anchor", "middle");
          badgeText.textContent = `GRID: ${settings.windowWidth.toFixed(2)}mm (${settings.frameCount}F)`;
          badgeG.appendChild(badgeText);

          annotGroup.appendChild(badgeG);
          overlayGroup.appendChild(annotGroup);
        }
      });

      svgEl.appendChild(overlayGroup);
    } catch (err) {
      console.warn("Overlay rendering skipped:", err);
    }
  }, [
    selectedZoneId,
    zones,
    zoneSettings,
    isSlicingPreviewActive,
    slicingPhase,
    slicingScale,
    slicingMode,
    scale, // Recalibrate on zoom to secure absolute geometry sync
    pan, // Sync coordinate system on panning
    svgContent,
    hiddenZoneIds,
  ]);

  // Helper to map client mouse coordinates to root SVG coordinate space
  const getSvgCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svgEl = svgWrapperRef.current?.querySelector("svg");
    if (!svgEl) return null;
    try {
      const pt = svgEl.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svgEl.getScreenCTM();
      if (ctm) {
        const transformed = pt.matrixTransform(ctm.inverse());
        return { x: transformed.x, y: transformed.y };
      }
    } catch (e) {
      console.warn("Could not transform coordinates to SVG:", e);
    }
    return null;
  };

  // Adjust SVG element class lists dynamically on hover or click
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Onscreen Vector line drawing handler
    if (isDrawingVector && vectorStart) {
      const coords = getSvgCoords(e.clientX, e.clientY);
      if (coords) {
        setVectorCurrent(coords);
        const dx = coords.x - vectorStart.x;
        const dy = coords.y - vectorStart.y;
        const length = Math.hypot(dx, dy);

        if (length > 6) {
          let angleDeg = Math.round(Math.atan2(dy, dx) * (180 / Math.PI));
          if (angleDeg < 0) angleDeg += 360;
          setLastCalculatedAngle(angleDeg);

          if (selectedZoneId && zoneSettings[selectedZoneId] && onUpdateZoneSettings) {
            const ux = Number((dx / length).toFixed(3));
            const uy = Number((dy / length).toFixed(3));
            onUpdateZoneSettings({
              ...zoneSettings[selectedZoneId],
              revealDirection: {
                angle: angleDeg,
                dx: ux,
                dy: uy,
              },
            });
          }
        }
      }
      return;
    }

    // Hover target checking
    const target = e.target as HTMLElement;
    const zoneEl = target.closest("[data-zone-id]");
    if (zoneEl) {
      const zoneId = zoneEl.getAttribute("data-zone-id");
      const zoneObj = zones.find((z) => z.id === zoneId);
      const settings = zoneObj ? zoneSettings[zoneObj.id] : null;
      const name = settings?.zoneName || zoneObj?.defaultName;
      const isRect1 =
        zoneObj &&
        (zoneObj.defaultName === "Rect #1" ||
          name === "Rect #1" ||
          (zoneObj.tagName === "rect" && zoneObj.id === "zone-0"));

      if (isRect1) {
        if (hoveredZoneId !== null) setHoveredZoneId(null);
        return;
      }

      if (zoneId !== hoveredZoneId) {
        setHoveredZoneId(zoneId);
      }
    } else if (hoveredZoneId !== null) {
      setHoveredZoneId(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // If middle mouse, or holding space, or active pan mode, trigger pan
    if (e.button === 1 || mode === "pan" || (e.shiftKey && mode !== "vector")) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      e.preventDefault();
      return;
    }

    // If in vector draw mode or holding alt/shift, start drawing directional line
    if (mode === "vector" && e.button === 0) {
      const coords = getSvgCoords(e.clientX, e.clientY);
      if (coords) {
        // Also ensure clicked zone is selected
        const target = e.target as HTMLElement;
        const zoneEl = target.closest("[data-zone-id]");
        if (zoneEl) {
          const zId = zoneEl.getAttribute("data-zone-id");
          if (zId && zId !== selectedZoneId) {
            onSelectZone(zId);
          }
        }

        setIsDrawingVector(true);
        setVectorStart(coords);
        setVectorCurrent(coords);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    // Finalize Vector Drawing
    if (isDrawingVector) {
      setIsDrawingVector(false);
      if (lastCalculatedAngle !== null) {
        showStatus?.(
          `Auto-calculated revealDirection to ${lastCalculatedAngle}° (${getDirectionLabel(lastCalculatedAngle)}) from canvas vector!`,
          "success"
        );
      }
      return;
    }

    // Only handle clicks for selecting zones in select mode or standard clicks
    if (mode === "select" && e.button === 0) {
      const target = e.target as HTMLElement;
      const zoneEl = target.closest("[data-zone-id]");
      if (zoneEl) {
        const zoneId = zoneEl.getAttribute("data-zone-id");
        const zoneObj = zones.find((z) => z.id === zoneId);
        const settings = zoneObj ? zoneSettings[zoneObj.id] : null;
        const name = settings?.zoneName || zoneObj?.defaultName;
        const isRect1 =
          zoneObj &&
          (zoneObj.defaultName === "Rect #1" ||
            name === "Rect #1" ||
            (zoneObj.tagName === "rect" && zoneObj.id === "zone-0"));

        if (isRect1) {
          onSelectZone(null);
        } else {
          onSelectZone(zoneId);
        }
      } else {
        // Did not click a zone
        onSelectZone(null);
      }
    }
  };

  const getDirectionLabel = (deg: number) => {
    if (deg >= 338 || deg < 23) return "Horizontal Right (0°)";
    if (deg >= 23 && deg < 68) return "Diagonal Down-Right (45°)";
    if (deg >= 68 && deg < 113) return "Vertical Down (90°)";
    if (deg >= 113 && deg < 158) return "Diagonal Down-Left (135°)";
    if (deg >= 158 && deg < 203) return "Horizontal Left (180°)";
    if (deg >= 203 && deg < 248) return "Diagonal Up-Left (225°)";
    if (deg >= 248 && deg < 293) return "Vertical Up (270°)";
    return "Diagonal Up-Right (315°)";
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    let newScale = scale;
    if (e.deltaY < 0) {
      newScale = Math.min(newScale * (1 + zoomIntensity), 8);
    } else {
      newScale = Math.max(newScale * (1 - zoomIntensity), 0.15);
    }
    setScale(newScale);
  };

  const handleZoom = (direction: "in" | "out") => {
    if (direction === "in") {
      setScale(Math.min(scale * 1.25, 8));
    } else {
      setScale(Math.max(scale * 0.8, 0.15));
    }
  };

  // Calculate collective union bounding box of all active curve elements in SVG space
  const getCombinedCurvesBBox = () => {
    const svgEl = svgWrapperRef.current?.querySelector("svg");
    if (!svgEl) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let validCount = 0;

    zones.forEach((zone) => {
      if (hiddenZoneIds[zone.id]) return;
      const isRect1 =
        zone.defaultName === "Rect #1" ||
        (zone.tagName === "rect" && zone.id === "zone-0");
      if (isRect1) return;

      const targetEl = svgEl.querySelector(`[data-zone-id="${zone.id}"]`);
      if (targetEl) {
        try {
          const geom = getShapeGeometry(targetEl as SVGElement);
          if (geom && geom.bbox && geom.bbox.width > 0 && geom.bbox.height > 0) {
            minX = Math.min(minX, geom.bbox.x);
            minY = Math.min(minY, geom.bbox.y);
            maxX = Math.max(maxX, geom.bbox.x + geom.bbox.width);
            maxY = Math.max(maxY, geom.bbox.y + geom.bbox.height);
            validCount++;
          }
        } catch {
          // ignore geometry parsing issues on complex nodes
        }
      }
    });

    if (validCount > 0 && Number.isFinite(minX) && Number.isFinite(maxX)) {
      const width = maxX - minX;
      const height = maxY - minY;
      return {
        x: minX,
        y: minY,
        width,
        height,
        cx: minX + width / 2,
        cy: minY + height / 2,
      };
    }

    // Fallback to SVG viewBox or attributes
    const vb = svgEl.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) {
      return {
        x: vb.x,
        y: vb.y,
        width: vb.width,
        height: vb.height,
        cx: vb.x + vb.width / 2,
        cy: vb.y + vb.height / 2,
      };
    }

    const wAttr = parseFloat(svgEl.getAttribute("width") || "500");
    const hAttr = parseFloat(svgEl.getAttribute("height") || "500");
    return { x: 0, y: 0, width: wAttr, height: hAttr, cx: wAttr / 2, cy: hAttr / 2 };
  };

  // Always zoom to the extents of all curves to the outer edge, centered in viewport
  const handleFitToAllCurves = (paddingFraction: number = 0.08) => {
    if (!containerRef.current || !svgWrapperRef.current) return;
    const svgEl = svgWrapperRef.current.querySelector("svg");
    if (!svgEl) return;

    const container = containerRef.current;
    const cW = container.clientWidth;
    const cH = container.clientHeight;
    if (cW <= 0 || cH <= 0) return;

    const combinedBBox = getCombinedCurvesBBox();
    if (!combinedBBox || combinedBBox.width <= 0 || combinedBBox.height <= 0) {
      setScale(1.0);
      setPan({ x: 0, y: 0 });
      return;
    }

    let currentVb = { minX: 0, minY: 0, width: 500, height: 500 };
    if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width > 0) {
      currentVb = {
        minX: svgEl.viewBox.baseVal.x,
        minY: svgEl.viewBox.baseVal.y,
        width: svgEl.viewBox.baseVal.width,
        height: svgEl.viewBox.baseVal.height,
      };
    } else {
      const wAttr = parseFloat(svgEl.getAttribute("width") || "500");
      const hAttr = parseFloat(svgEl.getAttribute("height") || "500");
      currentVb = { minX: 0, minY: 0, width: wAttr, height: hAttr };
    }

    const vbCx = currentVb.minX + currentVb.width / 2;
    const vbCy = currentVb.minY + currentVb.height / 2;

    // Available pixel dimensions inside viewport with margin
    const availableW = cW * 0.88;
    const availableH = cH * 0.88;

    const baseRenderScale = Math.min(availableW / currentVb.width, availableH / currentVb.height);
    if (baseRenderScale <= 0) return;

    // Target fill ratio so combined curves extend to the outer edge of viewport
    const targetFillRatio = 1.0 - paddingFraction * 2;
    const desiredPxPerUnit = Math.min(
      (availableW * targetFillRatio) / combinedBBox.width,
      (availableH * targetFillRatio) / combinedBBox.height
    );

    const targetScale = Math.min(Math.max(desiredPxPerUnit / baseRenderScale, 0.2), 12.0);

    // Pan offset to bring the curves' center to the center of the viewport
    const offsetUnitsX = vbCx - combinedBBox.cx;
    const offsetUnitsY = vbCy - combinedBBox.cy;
    const panX = offsetUnitsX * baseRenderScale * targetScale;
    const panY = offsetUnitsY * baseRenderScale * targetScale;

    setScale(targetScale);
    setPan({ x: Math.round(panX), y: Math.round(panY) });
  };

  // Zoom to Default View (saved default view or extents of all curves)
  const handleZoomToDefault = () => {
    if (savedDefaultView) {
      setScale(savedDefaultView.scale);
      setPan({ ...savedDefaultView.pan });
      showStatus?.("✓ Zoomed to saved default viewport framing.", "info");
    } else {
      handleFitToAllCurves(0.08);
      showStatus?.("Zoomed to all curves extents (default framing).", "info");
    }
  };

  const handleFit = () => {
    handleZoomToDefault();
  };

  // Set Current View as Default: Bakes viewport framing into SVG and saves default view coordinates
  const handleSetCurrentViewAsDefault = () => {
    if (!svgContent || !containerRef.current || !svgWrapperRef.current) return;
    try {
      const svgEl = svgWrapperRef.current.querySelector("svg");
      if (!svgEl) return;

      const container = containerRef.current;
      const cW = container.clientWidth;
      const cH = container.clientHeight;
      if (cW <= 0 || cH <= 0) return;

      // Save current viewport framing as default
      const viewToSave = { scale, pan: { ...pan } };
      setSavedDefaultView(viewToSave);
      try {
        localStorage.setItem("scanimation_default_view", JSON.stringify(viewToSave));
      } catch {
        // ignore
      }

      // Read current viewBox base values
      let currentVb = { minX: 0, minY: 0, width: 500, height: 500 };
      if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width > 0) {
        currentVb = {
          minX: svgEl.viewBox.baseVal.x,
          minY: svgEl.viewBox.baseVal.y,
          width: svgEl.viewBox.baseVal.width,
          height: svgEl.viewBox.baseVal.height,
        };
      } else {
        const wAttr = parseFloat(svgEl.getAttribute("width") || "500");
        const hAttr = parseFloat(svgEl.getAttribute("height") || "500");
        currentVb = { minX: 0, minY: 0, width: wAttr, height: hAttr };
      }

      const availableW = cW * 0.88;
      const availableH = cH * 0.88;
      const baseRenderScale = Math.min(availableW / currentVb.width, availableH / currentVb.height);
      if (baseRenderScale <= 0) return;

      const vbCx = currentVb.minX + currentVb.width / 2;
      const vbCy = currentVb.minY + currentVb.height / 2;

      // Current visible center in SVG coordinates:
      const effectiveScale = baseRenderScale * scale;
      const centerSvgX = vbCx - (pan.x / effectiveScale);
      const centerSvgY = vbCy - (pan.y / effectiveScale);

      const visibleUnitsW = availableW / effectiveScale;
      const visibleUnitsH = availableH / effectiveScale;

      const printAspect = (baseDocSize?.widthInches || 8.27) / (baseDocSize?.heightInches || 11.69);

      let finalWidth = visibleUnitsW;
      let finalHeight = visibleUnitsH;

      if (visibleUnitsW / visibleUnitsH > printAspect) {
        finalHeight = visibleUnitsW / printAspect;
      } else {
        finalWidth = visibleUnitsH * printAspect;
      }

      const finalMinX = Math.round(centerSvgX - finalWidth / 2);
      const finalMinY = Math.round(centerSvgY - finalHeight / 2);
      const roundedW = Math.max(20, Math.round(finalWidth));
      const roundedH = Math.max(20, Math.round(finalHeight));

      const newViewBoxStr = `${finalMinX} ${finalMinY} ${roundedW} ${roundedH}`;

      let updatedSvg = svgContent;
      if (/viewBox="[^"]*"/i.test(updatedSvg)) {
        updatedSvg = updatedSvg.replace(/viewBox="[^"]*"/i, `viewBox="${newViewBoxStr}"`);
      } else {
        updatedSvg = updatedSvg.replace(/<svg\b/i, `<svg viewBox="${newViewBoxStr}"`);
      }

      setScale(1.0);
      setPan({ x: 0, y: 0 });
      setSavedDefaultView({ scale: 1.0, pan: { x: 0, y: 0 } });
      try {
        localStorage.setItem("scanimation_default_view", JSON.stringify({ scale: 1.0, pan: { x: 0, y: 0 } }));
      } catch {
        // ignore
      }

      if (onUpdateSvgContent) {
        onUpdateSvgContent(updatedSvg);
      }

      showStatus?.(
        `✓ Current view saved as default! Calibrated to ${baseDocSize?.label || "A4"} (ViewBox: ${newViewBoxStr})`,
        "success"
      );
    } catch (err) {
      console.error("Failed to save current view as default:", err);
      showStatus?.("Failed to save view as default.", "error");
    }
  };

  const handleRepositionToViewport = handleSetCurrentViewAsDefault;

  // Zoom canvas to fit the extents of a specific curve with comfortable margin
  const zoomToZoneExtents = (zoneId: string) => {
    try {
      const zoneEl = document.querySelector(`[data-zone-id="${zoneId}"]`) as SVGElement;
      if (!zoneEl) return;
      const { bbox } = getShapeGeometry(zoneEl);
      if (!bbox || bbox.width <= 0 || bbox.height <= 0) return;

      const container = containerRef.current;
      if (!container) return;
      const cW = container.clientWidth;
      const cH = container.clientHeight;

      const svgEl = container.querySelector("svg");
      const vb = svgEl?.viewBox?.baseVal;
      const vbW = vb && vb.width > 0 ? vb.width : 500;
      const vbH = vb && vb.height > 0 ? vb.height : 500;

      // Desired zoom scale so bbox occupies ~75% of viewport
      const scaleX = (cW * 0.75) / bbox.width;
      const scaleY = (cH * 0.75) / bbox.height;
      const targetScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.4), 8);

      // SVG center to bbox center offset
      const bboxCenterX = bbox.x + bbox.width / 2;
      const bboxCenterY = bbox.y + bbox.height / 2;
      const dx = (vbW / 2 - bboxCenterX) * targetScale;
      const dy = (vbH / 2 - bboxCenterY) * targetScale;

      setScale(targetScale);
      setPan({ x: dx, y: dy });
    } catch (err) {
      console.warn("Could not zoom to curve extents:", err);
    }
  };

  // Double click handler: Opens Artwork Studio without altering the main viewport framing
  const handleDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    let zoneEl = target.closest("[data-zone-id]") as HTMLElement | null;

    if (!zoneEl) {
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      for (const el of elements) {
        const found = el.closest("[data-zone-id]");
        if (found) {
          zoneEl = found as HTMLElement;
          break;
        }
      }
    }

    if (zoneEl) {
      const zoneId = zoneEl.getAttribute("data-zone-id");
      if (!zoneId) return;
      const zoneObj = zones.find((z) => z.id === zoneId);
      const settings = zoneObj ? zoneSettings[zoneObj.id] : null;
      const name = settings?.zoneName || zoneObj?.defaultName;
      const isRect1 =
        zoneObj &&
        (zoneObj.defaultName === "Rect #1" ||
          name === "Rect #1" ||
          (zoneObj.tagName === "rect" && zoneObj.id === "zone-0"));
      if (isRect1) return;

      onSelectZone(zoneId);

      // If frame count is 0 or 1, or isSolid is true: curve is a solid curve with NO FRAMES -> DO NOT OPEN ARTWORK STUDIO
      const isSolidCurve = !!settings?.isSolid || (settings?.frameCount !== undefined && settings.frameCount <= 1);
      if (isSolidCurve) {
        showStatus?.(
          `"${name}" is a Solid curve (${settings?.frameCount || 0} frames). Slide frame count (≥ 2) in Calibration to create animated artwork.`,
          "info"
        );
        return;
      }

      // Open Frame Artwork Studio directly while keeping main viewport framing intact!
      if (onOpenArtworkStudio) {
        onOpenArtworkStudio(zoneId);
      }
    } else {
      // Double click on empty canvas space resets view to default view / all curves
      handleZoomToDefault();
      onSelectZone(null);
    }
  };

  const selectedZoneInfo = selectedZoneId ? zoneSettings[selectedZoneId] : null;

  // Render selection and hover styles dynamically injected inside a style tag
  const dynamicStyles = `
    /* Style all interactable paths/shapes */
    [data-zone-id] {
      cursor: pointer;
      transition: fill 0.15s ease, stroke 0.15s ease, filter 0.15s ease;
    }
    
    /* Hover state styling */
    ${
      hoveredZoneId
        ? `
      [data-zone-id="${hoveredZoneId}"] {
        filter: drop-shadow(0 0 10px rgba(255, 0, 127, 0.85));
        stroke: #ff007f !important;
        stroke-width: 3.5px !important;
        cursor: pointer;
      }
    `
        : ""
    }

    /* Active selection styling - Neon Pink */
    ${
      selectedZoneId
        ? `
      [data-zone-id="${selectedZoneId}"] {
        filter: drop-shadow(0 0 16px rgba(255, 0, 127, 0.95)) !important;
        stroke: #ff007f !important;
        stroke-width: 4px !important;
        fill: rgba(255, 0, 127, 0.18) !important;
      }
    `
        : ""
    }
  `;

  return (
    <div className="flex-1 flex flex-col h-full bg-black overflow-hidden relative border border-[#262626] rounded-none shadow-2xl">
      {/* Top action toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black border-b border-[#262626] z-10 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#ff007f] animate-pulse" />
          <span className="text-xs font-mono font-bold text-[#ff007f] tracking-wider uppercase">
            SVG VIEWPORT
          </span>
          {svgContent && (
            <span className="text-[10px] bg-black border border-[#ff007f]/40 text-[#ff007f] px-2 py-0.5 rounded-none font-mono font-bold">
              {zones.length} shapes mapped
            </span>
          )}
        </div>

        {/* Live Slicing & Wireframe Grid Quick HUD Switcher */}
        <div className="flex items-center gap-1.5 bg-[#090d16] border border-[#00f0ff]/30 px-2 py-1 rounded">
          {/* Master Live Preview Toggle */}
          <button
            onClick={() => setIsSlicingPreviewActive && setIsSlicingPreviewActive(!isSlicingPreviewActive)}
            className={`p-1 px-2 rounded text-[10px] font-mono font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              isSlicingPreviewActive
                ? "bg-[#00f0ff]/20 border border-[#00f0ff]/60 text-[#00f0ff] shadow-[0_0_8px_rgba(0,240,255,0.3)]"
                : "bg-[#141a26] border border-[#262626] text-stone-400"
            }`}
            title="Toggle Live Slicing Wireframe Grid directly over the SVG canvas"
          >
            {isSlicingPreviewActive ? <Eye className="w-3 h-3 text-[#00f0ff]" /> : <EyeOff className="w-3 h-3 text-stone-500" />}
            <span>LIVE GRID: {isSlicingPreviewActive ? "ON" : "OFF"}</span>
          </button>

          {/* Mode Pill Switcher */}
          {isSlicingPreviewActive && (
            <div className="flex items-center gap-0.5 bg-black p-0.5 rounded border border-[#222]">
              <button
                onClick={() => setSlicingMode && setSlicingMode("wireframe")}
                className={`px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded transition-all cursor-pointer ${
                  slicingMode === "wireframe" || slicingMode === "cutting"
                    ? "bg-[#00f0ff] text-black font-black"
                    : "text-stone-400 hover:text-white"
                }`}
                title="Wireframe Grid - Precision Slit Lines & Direction Vector overlay"
              >
                Wireframe
              </button>
              <button
                onClick={() => setSlicingMode && setSlicingMode("bars")}
                className={`px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded transition-all cursor-pointer ${
                  slicingMode === "bars"
                    ? "bg-[#00f0ff] text-black font-black"
                    : "text-stone-400 hover:text-white"
                }`}
                title="Physical Barrier Mask - Dark occlusion bars simulation"
              >
                Mask
              </button>
              <button
                onClick={() => setSlicingMode && setSlicingMode("both")}
                className={`px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded transition-all cursor-pointer ${
                  slicingMode === "both"
                    ? "bg-[#ff007f] text-white font-black"
                    : "text-stone-400 hover:text-white"
                }`}
                title="Dual View - Wireframe Cut Paths + Physical Barrier combined"
              >
                Dual
              </button>
            </div>
          )}

          {/* Live Phase Slider & Play Loop */}
          {isSlicingPreviewActive && (
            <div className="hidden sm:flex items-center gap-1.5 pl-1.5 border-l border-[#262626]">
              <button
                onClick={togglePhaseAnimation}
                className={`p-1 rounded cursor-pointer transition-colors ${
                  isAnimatingPhase
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse"
                    : "text-stone-400 hover:text-white"
                }`}
                title={isAnimatingPhase ? "Pause phase animation" : "Animate sliding phase across wireframe grid"}
              >
                <Play className="w-3 h-3" />
              </button>
              <span className="text-[9px] font-mono text-stone-300 font-bold">
                {((slicingPhase || 0) * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>

        {/* Pan / Select / Draw Vector Tools */}
        <div className="flex items-center gap-1.5 font-mono text-[10px]">
          {onOpenStitchedPreview && (
            <button
              onClick={onOpenStitchedPreview}
              className="p-1.5 px-2.5 rounded-none bg-[#ff007f]/20 hover:bg-[#ff007f]/30 border border-[#ff007f]/60 hover:border-[#ff007f] text-[#ff007f] text-[11px] font-bold flex items-center gap-1.5 transition-all uppercase tracking-wider cursor-pointer shadow-[0_0_12px_rgba(255,0,127,0.2)]"
              title="Stitch all sliced artwork frame-by-frame and preview composite animation"
            >
              <Film className="w-3.5 h-3.5 text-[#ff007f]" />
              <span className="hidden sm:inline">STITCHED PREVIEW</span>
            </button>
          )}

          <button
            onClick={() => setMode("select")}
            className={`p-1.5 rounded-none border text-[11px] flex items-center gap-1 transition-all uppercase tracking-wider cursor-pointer ${
              mode === "select"
                ? "bg-[#ff007f]/15 border-[#ff007f] text-[#ff007f] font-bold shadow-[0_0_8px_rgba(255,0,127,0.25)]"
                : "bg-black border-[#262626] text-stone-400 hover:text-stone-200 hover:border-stone-700"
            }`}
            title="Selection Tool - Click or double-click any closed SVG shape"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>Select</span>
          </button>

          <button
            onClick={() => setMode("vector")}
            className={`p-1.5 rounded-none border text-[11px] flex items-center gap-1 transition-all uppercase tracking-wider cursor-pointer ${
              mode === "vector"
                ? "bg-[#ff007f] border-[#ff007f] text-white font-black shadow-[0_0_15px_rgba(255,0,127,0.45)] animate-pulse"
                : "bg-black border-[#262626] text-[#ff007f] hover:border-[#ff007f]/60 hover:bg-[#ff007f]/10"
            }`}
            title="Vector Line Tool - Drag across canvas to auto-calculate reveal angle and unit vector"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Draw Vector</span>
          </button>

          <button
            onClick={() => setMode("pan")}
            className={`p-1.5 rounded-none border text-[11px] flex items-center gap-1 transition-all uppercase tracking-wider cursor-pointer ${
              mode === "pan"
                ? "bg-[#00f0ff]/10 border-[#00f0ff]/40 text-[#00f0ff] font-bold"
                : "bg-black border-[#262626] text-stone-400 hover:text-stone-200 hover:border-stone-700"
            }`}
            title="Viewport Pan Tool - Click and drag the canvas"
          >
            <Move className="w-3.5 h-3.5" />
            <span>Pan</span>
          </button>

          <div className="h-4 w-[1px] bg-[#262626] mx-1" />

          {/* Zoom controls */}
          <button
            onClick={() => handleZoom("in")}
            className="p-1.5 rounded-none bg-black border border-[#262626] text-stone-400 hover:text-stone-200 hover:border-stone-700 transition-all cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleZoom("out")}
            className="p-1.5 rounded-none bg-black border border-[#262626] text-stone-400 hover:text-stone-200 hover:border-stone-700 transition-all cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomToDefault}
            className="p-1.5 px-2.5 rounded-none bg-black hover:bg-[#111] border border-[#262626] hover:border-[#00f0ff]/50 text-stone-300 hover:text-[#00f0ff] transition-all cursor-pointer flex items-center gap-1.5 font-mono text-[10px] font-bold shadow-[0_0_8px_rgba(0,240,255,0.15)]"
            title="Zoom to Default View: Restores the viewport framing calibrated by 'Set Current View as Default' or all curves extents"
          >
            <Maximize2 className="w-3.5 h-3.5 text-[#00f0ff]" />
            <span>ZOOM TO DEFAULT</span>
            {savedDefaultView && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] animate-pulse" />
            )}
          </button>

          <div className="h-4 w-[1px] bg-[#262626] mx-1" />

          {/* Set Current View as Default Button */}
          <button
            onClick={handleSetCurrentViewAsDefault}
            className="p-1.5 px-2.5 rounded-none bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 border border-[#00f0ff]/50 text-[#00f0ff] hover:text-white transition-all flex items-center gap-1.5 font-mono text-[10px] font-black uppercase tracking-wider cursor-pointer shadow-[0_0_10px_rgba(0,240,255,0.25)]"
            title={`Set Current View as Default: Calibrates and bakes your current screen framing into the print document viewBox according to selected print size (${baseDocSize?.label || 'A4 (210 × 297 mm)'})`}
          >
            <Crop className="w-3.5 h-3.5 text-[#00f0ff]" />
            <span>SET CURRENT VIEW AS DEFAULT</span>
          </button>
        </div>
      </div>

      {/* Styled Blueprint Grid and canvas workspace */}
      <div
        id="scanimation-canvas-container"
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={() => {
          setIsPanning(false);
          setIsDrawingVector(false);
          setHoveredZoneId(null);
        }}
        onWheel={handleWheel}
        className={`flex-1 overflow-hidden relative outline-none select-none ${
          mode === "pan"
            ? isPanning
              ? "cursor-grabbing"
              : "cursor-grab"
            : mode === "vector"
            ? "cursor-crosshair"
            : "cursor-default"
        }`}
        style={{
          backgroundColor: "#000000",
        }}
      >
        {/* Pulsing Cyber Grid Overlay */}
        <div
          className="absolute inset-0 pointer-events-none animate-cyber-pulse"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255, 0, 127, 0.04) 1.2px, transparent 1.2px),
              linear-gradient(90deg, rgba(255, 0, 127, 0.04) 1.2px, transparent 1.2px),
              linear-gradient(rgba(0, 240, 255, 0.015) 2.5px, transparent 2.5px),
              linear-gradient(90deg, rgba(0, 240, 255, 0.015) 2.5px, transparent 2.5px)
            `,
            backgroundSize: "80px 80px, 80px 80px, 16px 16px, 16px 16px",
            backgroundPosition: "0 0",
          }}
        />

        {/* Dynamic style block injection */}
        <style dangerouslySetInnerHTML={{ __html: dynamicStyles }} />

        {svgContent ? (
          <div
            ref={svgWrapperRef}
            className="absolute transition-transform duration-75 origin-center pointer-events-auto"
            style={{
              transform: `translate(calc(50% + ${pan.x}px - 50%), calc(50% + ${pan.y}px - 50%)) scale(${scale})`,
              left: "10%",
              top: "10%",
              right: "10%",
              bottom: "10%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transformOrigin: "center",
            }}
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} className="relative" />

            {/* Dotted Paper Boundary Curve Overlay indicating base print sheet (A4 default) */}
            {(() => {
              const svgEl = svgWrapperRef.current?.querySelector("svg");
              const vb = svgEl?.viewBox?.baseVal;
              const vbW = vb && vb.width > 0 ? vb.width : 500;
              const vbH = vb && vb.height > 0 ? vb.height : 500;
              const vbMinX = vb ? vb.x : 0;
              const vbMinY = vb ? vb.y : 0;

              const paperWIn = baseDocSize?.widthInches || 8.27;
              const paperHIn = baseDocSize?.heightInches || 11.69;
              const paperAspect = paperWIn / paperHIn;

              let paperW = vbW;
              let paperH = vbH;
              let paperX = vbMinX;
              let paperY = vbMinY;

              if (vbW / vbH > paperAspect) {
                paperH = vbH * 0.94;
                paperW = paperH * paperAspect;
                paperX = vbMinX + (vbW - paperW) / 2;
                paperY = vbMinY + (vbH - paperH) / 2;
              } else {
                paperW = vbW * 0.94;
                paperH = paperW / paperAspect;
                paperX = vbMinX + (vbW - paperW) / 2;
                paperY = vbMinY + (vbH - paperH) / 2;
              }

              const cornerSize = Math.max(10, Math.min(28, paperW * 0.06));

              return (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-10"
                  viewBox={`${vbMinX} ${vbMinY} ${vbW} ${vbH}`}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
                >
                  <defs>
                    <filter id="paper-glow-filter" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#00f0ff" floodOpacity="0.4" />
                    </filter>
                  </defs>

                  {/* Dotted curve representing the exact edge of the paper page */}
                  <rect
                    x={paperX}
                    y={paperY}
                    width={paperW}
                    height={paperH}
                    fill="none"
                    stroke="#00f0ff"
                    strokeWidth="1.6"
                    strokeDasharray="8 6"
                    strokeOpacity="0.75"
                    rx="2"
                    filter="url(#paper-glow-filter)"
                  />

                  {/* Corner registration brackets */}
                  <path
                    d={`
                      M ${paperX} ${paperY + cornerSize} L ${paperX} ${paperY} L ${paperX + cornerSize} ${paperY}
                      M ${paperX + paperW - cornerSize} ${paperY} L ${paperX + paperW} ${paperY} L ${paperX + paperW} ${paperY + cornerSize}
                      M ${paperX} ${paperY + paperH - cornerSize} L ${paperX} ${paperY + paperH} L ${paperX + cornerSize} ${paperY + paperH}
                      M ${paperX + paperW - cornerSize} ${paperY + paperH} L ${paperX + paperW} ${paperY + paperH} L ${paperX + paperW} ${paperY + paperH - cornerSize}
                    `}
                    fill="none"
                    stroke="#00f0ff"
                    strokeWidth="2.5"
                    strokeOpacity="0.9"
                  />

                  {/* Paper edge badge tag */}
                  <g transform={`translate(${paperX + paperW / 2}, ${paperY - 9})`}>
                    <rect
                      x="-100"
                      y="-12"
                      width="200"
                      height="18"
                      fill="#0b0e14"
                      stroke="#00f0ff"
                      strokeWidth="1.2"
                      rx="2"
                      fillOpacity="0.95"
                    />
                    <text
                      x="0"
                      y="0"
                      fill="#00f0ff"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="central"
                      letterSpacing="0.05em"
                    >
                      ⊞ {baseDocSize?.label || "A4 (210 × 297 mm)"} PAPER EDGE
                    </text>
                  </g>
                </svg>
              );
            })()}

            {/* Live Onscreen Directional Vector Line Overlay */}
            {isDrawingVector && vectorStart && vectorCurrent && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-30"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
              >
                <defs>
                  <marker
                    id="vector-arrowhead"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 3.5, 0 7" fill="#ff007f" />
                  </marker>
                  <linearGradient id="vector-line-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00f0ff" />
                    <stop offset="100%" stopColor="#ff007f" />
                  </linearGradient>
                </defs>

                {/* Vector connection line with glowing filter */}
                <line
                  x1={vectorStart.x}
                  y1={vectorStart.y}
                  x2={vectorCurrent.x}
                  y2={vectorCurrent.y}
                  stroke="url(#vector-line-grad)"
                  strokeWidth="3.5"
                  strokeDasharray="6 3"
                  markerEnd="url(#vector-arrowhead)"
                  style={{ filter: "drop-shadow(0 0 8px rgba(255, 0, 127, 0.9))" }}
                />

                {/* Origin Anchor Circle */}
                <circle
                  cx={vectorStart.x}
                  cy={vectorStart.y}
                  r="5.5"
                  fill="#00f0ff"
                  stroke="#ffffff"
                  strokeWidth="2"
                  style={{ filter: "drop-shadow(0 0 6px rgba(0, 240, 255, 0.9))" }}
                />

                {/* Floating Angle & Direction Badge */}
                {lastCalculatedAngle !== null && (
                  <g transform={`translate(${vectorCurrent.x + 12}, ${vectorCurrent.y - 12})`}>
                    <rect
                      x="0"
                      y="-18"
                      width="130"
                      height="24"
                      fill="#0b0e14"
                      stroke="#ff007f"
                      strokeWidth="1.5"
                      rx="2"
                      style={{ filter: "drop-shadow(0 0 10px rgba(0,0,0,0.8))" }}
                    />
                    <text
                      x="65"
                      y="-3"
                      fill="#ffffff"
                      fontSize="11"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {lastCalculatedAngle}° ➔ {getDirectionLabel(lastCalculatedAngle).split(" ")[0]}
                    </text>
                  </g>
                )}
              </svg>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-black/95 backdrop-blur-sm z-0">
            <div className="p-4 rounded-none bg-black border border-[#262626] text-[#ff007f] animate-pulse mb-4">
              <Layers className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-bold text-stone-100 font-mono tracking-widest uppercase mb-2">
              No Artwork Loaded
            </h3>
            <p className="text-stone-500 text-[10px] uppercase font-mono max-w-sm mb-4 leading-relaxed">
              Upload an SVG document, or select one of our pre-crafted isometric and optical system templates
              to begin parsing zones.
            </p>
          </div>
        )}

        {/* Floating status display */}
        {svgContent && (
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3 pointer-events-none">
            {/* Viewport indicators */}
            <div className="px-2.5 py-1 rounded bg-black/90 border border-[#262626] text-[10px] font-mono text-stone-400 flex items-center gap-3">
              <span>Zoom: {Math.round(scale * 100)}%</span>
              <span className="w-1.5 h-1.5 bg-[#262626]" />
              <span>
                Offset: {Math.round(pan.x)}px, {Math.round(pan.y)}px
              </span>
              {selectedZoneId && zoneSettings[selectedZoneId] && (
                <>
                  <span className="w-1.5 h-1.5 bg-[#ff007f]" />
                  <span className="text-[#ff007f] font-bold">
                    Angle: {zoneSettings[selectedZoneId].revealDirection.angle}° • Pitch:{" "}
                    {zoneSettings[selectedZoneId].windowWidth.toFixed(2)}mm
                  </span>
                </>
              )}
            </div>

            {/* Custom overlay hints */}
            {hoveredZoneId && (
              <div className="px-2.5 py-1 rounded bg-black/90 border border-[#ff007f]/50 text-[10px] font-mono text-[#ff007f] flex items-center gap-1.5 shadow-[0_0_10px_rgba(255,0,127,0.2)]">
                <Info className="w-3 h-3" />
                <span>Selected curve: {zoneSettings[hoveredZoneId]?.zoneName || hoveredZoneId}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
