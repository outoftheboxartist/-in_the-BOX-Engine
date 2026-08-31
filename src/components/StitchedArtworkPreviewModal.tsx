/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  X,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Layers,
  Sparkles,
  Film,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sliders,
  RefreshCw,
  Copy,
  Scissors,
  CheckCircle2,
  Palette,
  FileArchive,
  ArrowRight,
  Info,
} from "lucide-react";
import JSZip from "jszip";
import { SVGZoneInfo, ZoneSettings, ZoneArtwork, DrawStroke, FrameArtwork } from "../types";
import {
  generateLinesData,
  clipLineToPolygon,
  getShapeGeometry,
  isPointInPolygon,
} from "../utils/slicing";
import { drawSmoothStroke } from "../utils/drawingSmoothing";
import { CruciformIcon } from "./CruciformIcon";

interface StitchedArtworkPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  zones: SVGZoneInfo[];
  zoneSettings: Record<string, ZoneSettings>;
  zoneArtworks: Record<string, ZoneArtwork>;
  svgContent?: string | null;
  projectName?: string;
  slicingScale?: number;
  slicingPhase?: number;
  onSelectZone?: (zoneId: string) => void;
  onOpenArtworkStudio?: (zoneId: string) => void;
  showStatus?: (text: string, type?: "success" | "error" | "info") => void;
}

type PreviewMode = "clean" | "interlaced" | "simulation" | "frame_slices" | "top_layer_cut";

export function StitchedArtworkPreviewModal({
  isOpen,
  onClose,
  zones = [],
  zoneSettings = {},
  zoneArtworks = {},
  svgContent = null,
  projectName = "Artwork",
  slicingScale = 1.0,
  slicingPhase = 0.0,
  onSelectZone,
  onOpenArtworkStudio,
  showStatus,
}: StitchedArtworkPreviewModalProps) {
  // Filter out the outer background canvas rect
  const activeZones = useMemo(() => {
    if (!zones || !Array.isArray(zones)) return [];
    return zones.filter((z) => {
      if (!z || !z.id) return false;
      const settings = zoneSettings ? zoneSettings[z.id] : undefined;
      const name = settings?.zoneName || z.defaultName || "";
      const isRect1 =
        z.defaultName === "Rect #1" ||
        name === "Rect #1" ||
        (z.tagName === "rect" && z.id === "zone-0");
      return !isRect1;
    });
  }, [zones, zoneSettings]);

  // Determine maximum frame count among active zones
  const maxFrameCount = useMemo(() => {
    if (!activeZones || activeZones.length === 0) return 6;
    const counts = activeZones.map((z) => {
      const fc = zoneSettings?.[z.id]?.frameCount;
      return typeof fc === "number" && !isNaN(fc) && fc > 0 ? fc : 6;
    });
    const max = Math.max(...counts, 2);
    return Number.isFinite(max) && max > 0 ? Math.min(max, 60) : 6;
  }, [activeZones, zoneSettings]);

  // State
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0); // 0-based
  const [previewMode, setPreviewMode] = useState<PreviewMode>("simulation");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackFps, setPlaybackFps] = useState<number>(6);
  const [slitPhase, setSlitPhase] = useState<number>(0.0); // 0.0 to 1.0
  const [slitOpacity, setSlitOpacity] = useState<number>(0.85);
  const [hiddenZoneIds, setHiddenZoneIds] = useState<Record<string, boolean>>({});
  const [canvasBg, setCanvasBg] = useState<"dark" | "light" | "transparent">("dark");
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);

  // Top Layer Cut Mode State (Vinyl Cutter Mask)
  const [cutBgType, setCutBgType] = useState<"black" | "transparent" | "white">("black");
  const [cutStripeStyle, setCutStripeStyle] = useState<"slits" | "bars">("slits");
  const [isExportingCutZip, setIsExportingCutZip] = useState<boolean>(false);

  // Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cached geometry data for each zone
  const [zonesGeometry, setZonesGeometry] = useState<
    Record<
      string,
      {
        bbox: { x: number; y: number; width: number; height: number };
        polygon: { x: number; y: number }[];
        viewBox: { x: number; y: number; width: number; height: number };
      }
    >
  >({});

  // ViewBox extraction
  const rootSvgViewBox = useMemo(() => {
    try {
      if (svgContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgContent, "image/svg+xml");
        const svgEl = doc.querySelector("svg");
        const viewBoxStr = svgEl?.getAttribute("viewBox");
        if (viewBoxStr) {
          const parts = viewBoxStr.split(/[\s,]+/).map(parseFloat).filter((n) => !isNaN(n));
          if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
            return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
          }
        }
        const wAttr = parseFloat(svgEl?.getAttribute("width") || "");
        const hAttr = parseFloat(svgEl?.getAttribute("height") || "");
        if (!isNaN(wAttr) && !isNaN(hAttr) && wAttr > 0 && hAttr > 0) {
          return { x: 0, y: 0, width: wAttr, height: hAttr };
        }
      }
      return { x: 0, y: 0, width: 500, height: 500 };
    } catch {
      return { x: 0, y: 0, width: 500, height: 500 };
    }
  }, [svgContent]);

  // High-Res Canvas Dimensions maintaining exact 1:1 uniform SVG aspect ratio without stretching
  const canvasDimensions = useMemo(() => {
    const vbW = Math.max(1, rootSvgViewBox?.width || 500);
    const vbH = Math.max(1, rootSvgViewBox?.height || 500);
    const maxDim = 1600;
    if (vbW >= vbH) {
      return {
        width: maxDim,
        height: Math.max(1, Math.round((maxDim * vbH) / vbW)),
        aspectRatio: `${vbW} / ${vbH}`,
      };
    } else {
      return {
        width: Math.max(1, Math.round((maxDim * vbW) / vbH)),
        height: maxDim,
        aspectRatio: `${vbW} / ${vbH}`,
      };
    }
  }, [rootSvgViewBox]);

  // Extract geometries whenever modal opens or active zones change
  useEffect(() => {
    if (!isOpen) return;

    const geometries: Record<
      string,
      {
        bbox: { x: number; y: number; width: number; height: number };
        polygon: { x: number; y: number }[];
        viewBox: { x: number; y: number; width: number; height: number };
      }
    > = {};

    let tempDiv: HTMLDivElement | null = null;
    if (svgContent) {
      try {
        tempDiv = document.createElement("div");
        tempDiv.style.position = "fixed";
        tempDiv.style.opacity = "0";
        tempDiv.style.pointerEvents = "none";
        tempDiv.style.left = "-9999px";
        tempDiv.style.top = "-9999px";
        tempDiv.innerHTML = svgContent;
        document.body.appendChild(tempDiv);
      } catch (e) {
        console.warn("Could not create tempDiv for SVG content", e);
      }
    }

    activeZones.forEach((z) => {
      try {
        let el = document.querySelector(`[data-zone-id="${z.id}"]`) as SVGElement;
        if (!el && tempDiv) {
          el = tempDiv.querySelector(`[data-zone-id="${z.id}"]`) as SVGElement;
        }
        if (el) {
          const { bbox, polygon } = getShapeGeometry(el);
          if (polygon && polygon.length >= 3) {
            geometries[z.id] = {
              bbox,
              polygon,
              viewBox: rootSvgViewBox,
            };
          }
        }
      } catch (e) {
        console.warn("Could not extract geometry for zone", z.id, e);
      }
    });

    if (tempDiv && document.body.contains(tempDiv)) {
      try {
        document.body.removeChild(tempDiv);
      } catch (e) {
        // ignore
      }
    }

    setZonesGeometry(geometries);
  }, [isOpen, activeZones, svgContent, rootSvgViewBox]);

  // Animation Playback Loop
  useEffect(() => {
    if (isPlaying && maxFrameCount > 1) {
      playTimerRef.current = setInterval(() => {
        if (previewMode === "simulation") {
          // Slide slit phase continuously for smooth optical scanimation
          setSlitPhase((prev) => (prev + 1 / maxFrameCount) % 1.0);
          setCurrentFrameIndex((prev) => (prev + 1) % maxFrameCount);
        } else {
          setCurrentFrameIndex((prev) => (prev + 1) % maxFrameCount);
        }
      }, 1000 / playbackFps);
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, maxFrameCount, playbackFps, previewMode]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentFrameIndex((prev) => (prev > 0 ? prev - 1 : maxFrameCount - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentFrameIndex((prev) => (prev < maxFrameCount - 1 ? prev + 1 : 0));
      } else if (e.key === " " && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setIsPlaying((p) => !p);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, maxFrameCount]);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentFrameIndex(0);
      setIsPlaying(false);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [isOpen]);

  // Draw Artwork Function
  const renderStitchedArtwork = () => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      if (!w || !h || w <= 0 || h <= 0) return;
      ctx.clearRect(0, 0, w, h);

      // Background color
      if (previewMode === "top_layer_cut") {
        if (cutBgType === "black") {
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, w, h);
        } else if (cutBgType === "white") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
        }
        // If cutBgType === "transparent", canvas remains completely cleared (transparent alpha)
      } else {
        if (canvasBg === "dark") {
          ctx.fillStyle = "#0a0a0a";
          ctx.fillRect(0, 0, w, h);
        } else if (canvasBg === "light") {
          ctx.fillStyle = "#f8f9fa";
          ctx.fillRect(0, 0, w, h);
        }
      }

      const vbWidth = Math.max(1, rootSvgViewBox?.width || 500);
      const vbHeight = Math.max(1, rootSvgViewBox?.height || 500);
      const vbX = rootSvgViewBox?.x || 0;
      const vbY = rootSvgViewBox?.y || 0;

      // Exact uniform scaling preserving original aspect ratio
      const scale = Math.min(w / vbWidth, h / vbHeight);

      ctx.save();
      ctx.scale(scale, scale);
      ctx.translate(-vbX, -vbY);

      // 1. Draw SVG Background outlines/geometry faintly if not in top_layer_cut mode
      if (previewMode !== "top_layer_cut") {
        activeZones.forEach((z) => {
          if (hiddenZoneIds[z.id]) return;
          const geom = zonesGeometry[z.id];
          if (!geom || !geom.polygon || geom.polygon.length < 3) return;

          ctx.beginPath();
          geom.polygon.forEach((pt, idx) => {
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.closePath();
          ctx.strokeStyle = canvasBg === "light" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)";
          ctx.lineWidth = 1 / Math.max(0.001, scale);
          ctx.stroke();
        });
      }

      // 2. Render Artwork depending on mode
      activeZones.forEach((z) => {
        if (hiddenZoneIds[z.id]) return;
        const settings = zoneSettings[z.id];
        const geom = zonesGeometry[z.id];
        const artwork = zoneArtworks[z.id];
        if (!settings || !geom || !geom.polygon || geom.polygon.length < 3) return;

        const isSolid = !!settings.isSolid || (settings.frameCount !== undefined && settings.frameCount <= 1);
        const zoneFrameCount = Math.max(1, settings.frameCount || 6);
        const effectiveFrameIdx = isSolid ? 0 : currentFrameIndex % zoneFrameCount;

        ctx.save();

        // Clip strictly to this curve's polygon contour
        ctx.beginPath();
        geom.polygon.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        ctx.clip();

        if (previewMode === "top_layer_cut") {
          if (isSolid) {
            // For solid static curves, fill entire shape in mask
            ctx.fillStyle = cutBgType === "white" ? "#000000" : "#ffffff";
            ctx.fill();
          } else {
            // TOP LAYER CUT: Solid pure white single slice stripe for this active frame (or solid barrier bars)
            const framePhase = slicingPhase + effectiveFrameIdx / zoneFrameCount;
            const { lines, lineThickness } = generateLinesData(
              geom.bbox,
              settings,
              slicingScale,
              framePhase,
              cutStripeStyle === "bars"
            );

            if (lines.length > 0) {
              const stripeColor = cutBgType === "white" ? "#000000" : "#ffffff";
              ctx.strokeStyle = stripeColor;
              ctx.lineWidth = lineThickness;
              ctx.lineCap = "butt";

              lines.forEach((l) => {
                ctx.beginPath();
                ctx.moveTo(l.x1, l.y1);
                ctx.lineTo(l.x2, l.y2);
                ctx.stroke();
              });
            }
          }
        } else if (previewMode === "clean") {
          // Render un-sliced clean artwork for effectiveFrameIdx
          const frame = artwork?.frames?.[effectiveFrameIdx];
          if (frame) {
            renderSingleFrameContent(ctx, frame, geom);
          }
        } else if (previewMode === "interlaced" || previewMode === "simulation") {
          if (isSolid) {
            const frame = artwork?.frames?.[0];
            if (frame) {
              renderSingleFrameContent(ctx, frame, geom);
            }
          } else {
            // Interlaced mode: Render ALL frames sliced together into the physical printed sheet
            for (let f = 0; f < zoneFrameCount; f++) {
              const frame = artwork?.frames?.[f];
              if (!frame) continue;

              // Generate slice lines for this specific frame
              const framePhase = slicingPhase + f / zoneFrameCount;
              const { lines, lineThickness } = generateLinesData(
                geom.bbox,
                settings,
                slicingScale,
                framePhase,
                false // transparent window slits
              );

              if (lines.length === 0) continue;

              ctx.save();
              // Create clipping path from slice lines
              ctx.beginPath();
              lines.forEach((l) => {
                const angle = Math.atan2(l.y2 - l.y1, l.x2 - l.x1);
                const halfW = lineThickness / 2;
                const nx = -Math.sin(angle) * halfW;
                const ny = Math.cos(angle) * halfW;

                ctx.moveTo(l.x1 + nx, l.y1 + ny);
                ctx.lineTo(l.x2 + nx, l.y2 + ny);
                ctx.lineTo(l.x2 - nx, l.y2 - ny);
                ctx.lineTo(l.x1 - nx, l.y1 - ny);
                ctx.closePath();
              });
              ctx.clip();

              // Draw this frame's artwork inside its slice slits
              renderSingleFrameContent(ctx, frame, geom);
              ctx.restore();
            }
          }
        } else if (previewMode === "frame_slices") {
          if (isSolid) {
            const frame = artwork?.frames?.[0];
            if (frame) {
              renderSingleFrameContent(ctx, frame, geom);
            }
          } else {
            // Single Frame Slices: Render only the slices for effectiveFrameIdx
            const frame = artwork?.frames?.[effectiveFrameIdx];
            if (frame) {
              const framePhase = slicingPhase + effectiveFrameIdx / zoneFrameCount;
              const { lines, lineThickness } = generateLinesData(
                geom.bbox,
                settings,
                slicingScale,
                framePhase,
                false
              );

              if (lines.length > 0) {
                ctx.save();
                ctx.beginPath();
                lines.forEach((l) => {
                  const angle = Math.atan2(l.y2 - l.y1, l.x2 - l.x1);
                  const halfW = lineThickness / 2;
                  const nx = -Math.sin(angle) * halfW;
                  const ny = Math.cos(angle) * halfW;

                  ctx.moveTo(l.x1 + nx, l.y1 + ny);
                  ctx.lineTo(l.x2 + nx, l.y2 + ny);
                  ctx.lineTo(l.x2 - nx, l.y2 - ny);
                  ctx.lineTo(l.x1 - nx, l.y1 - ny);
                  ctx.closePath();
                });
                ctx.clip();

                renderSingleFrameContent(ctx, frame, geom);
                ctx.restore();
              }
            }
          }
        }

        ctx.restore();
      });

      // 3. Physical Slit Simulation Overlay
      if (previewMode === "simulation") {
        activeZones.forEach((z) => {
          if (hiddenZoneIds[z.id]) return;
          const settings = zoneSettings[z.id];
          const geom = zonesGeometry[z.id];
          if (!settings || !geom || !geom.polygon || geom.polygon.length < 3) return;

          const isSolid = !!settings.isSolid || (settings.frameCount !== undefined && settings.frameCount <= 1);
          if (isSolid) return;

          const zoneFrameCount = Math.max(1, settings.frameCount || 6);
          const currentSlitPhase = (slitPhase + currentFrameIndex / zoneFrameCount) % 1.0;

          // Generate BAR lines (black barrier) leaving narrow transparent slits
          const { lines, lineThickness } = generateLinesData(
            geom.bbox,
            settings,
            slicingScale,
            currentSlitPhase,
            true // Use bars (solid dark mask)
          );

          if (lines.length === 0) return;

          ctx.save();
          // Clip barrier overlay to zone polygon
          ctx.beginPath();
          geom.polygon.forEach((pt, idx) => {
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.closePath();
          ctx.clip();

          // Render black barrier lines with chosen opacity
          ctx.strokeStyle = `rgba(0, 0, 0, ${slitOpacity})`;
          ctx.lineWidth = lineThickness;
          ctx.lineCap = "butt";

          lines.forEach((l) => {
            ctx.beginPath();
            ctx.moveTo(l.x1, l.y1);
            ctx.lineTo(l.x2, l.y2);
            ctx.stroke();
          });

          ctx.restore();
        });
      }

      ctx.restore();
    } catch (err) {
      console.error("renderStitchedArtwork error:", err);
    }
  };

  // Helper to render artwork strokes / image for a single frame
  const renderSingleFrameContent = (
    ctx: CanvasRenderingContext2D,
    frame: FrameArtwork,
    geom: { bbox: { x: number; y: number; width: number; height: number } }
  ) => {
    if (!frame || !geom || !geom.bbox) return;

    try {
      // 1. Image if present
      if (frame.imageDataUrl) {
        const img = new Image();
        img.src = frame.imageDataUrl;
        if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
          ctx.save();
          const transform = frame.imageTransform || { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0 };
          const bbox = geom.bbox;
          const cx = bbox.x + bbox.width / 2 + (transform.x || 0);
          const cy = bbox.y + bbox.height / 2 + (transform.y || 0);
          const sx = (transform.scale || 1) * (transform.scaleX !== undefined ? transform.scaleX : 1);
          const sy = (transform.scale || 1) * (transform.scaleY !== undefined ? transform.scaleY : 1);

          ctx.translate(cx, cy);
          ctx.rotate(((transform.rotation || 0) * Math.PI) / 180);
          ctx.scale(sx, sy);

          const maxDim = Math.max(img.naturalWidth, img.naturalHeight);
          const fitScale = maxDim > 0 ? Math.min(bbox.width, bbox.height) / maxDim : 1;
          const drawW = img.naturalWidth * fitScale;
          const drawH = img.naturalHeight * fitScale;

          ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();
        } else if (!img.complete) {
          img.onload = () => {
            renderStitchedArtwork();
          };
        }
      }

      // 2. Vector brush strokes
      if (frame.strokes && Array.isArray(frame.strokes) && frame.strokes.length > 0) {
        frame.strokes.forEach((stroke) => {
          if (!stroke || !stroke.points || stroke.points.length === 0) return;
          drawSmoothStroke(ctx, stroke);
        });
      }
    } catch (e) {
      console.warn("renderSingleFrameContent error:", e);
    }
  };

  // Redraw canvas whenever relevant state changes
  useEffect(() => {
    if (isOpen) {
      renderStitchedArtwork();
    }
  }, [
    isOpen,
    currentFrameIndex,
    previewMode,
    slitPhase,
    slitOpacity,
    hiddenZoneIds,
    canvasBg,
    cutBgType,
    cutStripeStyle,
    zonesGeometry,
    zoneArtworks,
    zoneSettings,
    slicingScale,
    slicingPhase,
  ]);

  // Export current frame as PNG
  const handleExportCurrentFramePng = () => {
    if (previewMode === "top_layer_cut") {
      handleExportTopLayerCutPng();
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-stitched-frame-${
      currentFrameIndex + 1
    }.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (showStatus) showStatus(`Exported Frame #${currentFrameIndex + 1} PNG`, "success");
  };

  // Export 4K Ultra-HD Top Layer Cut PNG (300+ DPI, Vinyl Cutter Ready)
  const handleExportTopLayerCutPng = (exportDim = 4096) => {
    try {
      const vbW = Math.max(1, rootSvgViewBox.width);
      const vbH = Math.max(1, rootSvgViewBox.height);
      let exportW = exportDim;
      let exportH = exportDim;
      if (vbW >= vbH) {
        exportW = exportDim;
        exportH = Math.max(1, Math.round((exportDim * vbH) / vbW));
      } else {
        exportH = exportDim;
        exportW = Math.max(1, Math.round((exportDim * vbW) / vbH));
      }

      const offCanvas = document.createElement("canvas");
      offCanvas.width = exportW;
      offCanvas.height = exportH;
      const offCtx = offCanvas.getContext("2d");
      if (!offCtx) return;

      offCtx.clearRect(0, 0, exportW, exportH);
      if (cutBgType === "black") {
        offCtx.fillStyle = "#000000";
        offCtx.fillRect(0, 0, exportW, exportH);
      } else if (cutBgType === "white") {
        offCtx.fillStyle = "#ffffff";
        offCtx.fillRect(0, 0, exportW, exportH);
      }
      // If transparent, canvas is clear alpha 0

      const scale = exportW / vbW;

      offCtx.save();
      offCtx.scale(scale, scale);
      offCtx.translate(-rootSvgViewBox.x, -rootSvgViewBox.y);

      const stripeColor = cutBgType === "white" ? "#000000" : "#ffffff";

      activeZones.forEach((z) => {
        if (hiddenZoneIds[z.id]) return;
        const settings = zoneSettings[z.id];
        const geom = zonesGeometry[z.id];
        if (!settings || !geom || geom.polygon.length < 3) return;

        const zoneFrameCount = settings.frameCount || 6;
        const effectiveFrameIdx = currentFrameIndex % zoneFrameCount;
        const framePhase = slicingPhase + effectiveFrameIdx / zoneFrameCount;

        const { lines, lineThickness } = generateLinesData(
          geom.bbox,
          settings,
          slicingScale,
          framePhase,
          cutStripeStyle === "bars"
        );

        if (lines.length === 0) return;

        offCtx.save();
        offCtx.beginPath();
        geom.polygon.forEach((pt, idx) => {
          if (idx === 0) offCtx.moveTo(pt.x, pt.y);
          else offCtx.lineTo(pt.x, pt.y);
        });
        offCtx.closePath();
        offCtx.clip();

        offCtx.strokeStyle = stripeColor;
        offCtx.lineWidth = lineThickness;
        offCtx.lineCap = "butt";

        lines.forEach((l) => {
          offCtx.beginPath();
          offCtx.moveTo(l.x1, l.y1);
          offCtx.lineTo(l.x2, l.y2);
          offCtx.stroke();
        });

        offCtx.restore();
      });

      offCtx.restore();

      const bgLabel =
        cutBgType === "transparent"
          ? "transparent-bg"
          : cutBgType === "white"
          ? "black-on-white"
          : "white-on-black";
      const dataUrl = offCanvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${projectName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}-top-layer-cut-frame-${
        currentFrameIndex + 1
      }-${bgLabel}-4K-300DPI.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (showStatus) {
        showStatus(
          `Exported 4K Ultra-HD Top Layer Cut PNG (Frame #${currentFrameIndex + 1}) [${bgLabel.toUpperCase()}]`,
          "success"
        );
      }
    } catch (err: any) {
      alert(`Top Layer Cut Export failed: ${err.message}`);
    }
  };

  // Export All Top Layer Cut Frames in a single 4K ZIP Package
  const handleExportAllCutFramesZip = async () => {
    setIsExportingCutZip(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(`${projectName}-vinyl-cut-masks-4K`);
      const exportDim = 4096;
      const vbW = Math.max(1, rootSvgViewBox.width);
      const vbH = Math.max(1, rootSvgViewBox.height);
      let exportW = exportDim;
      let exportH = exportDim;
      if (vbW >= vbH) {
        exportW = exportDim;
        exportH = Math.max(1, Math.round((exportDim * vbH) / vbW));
      } else {
        exportH = exportDim;
        exportW = Math.max(1, Math.round((exportDim * vbW) / vbH));
      }

      const offCanvas = document.createElement("canvas");
      offCanvas.width = exportW;
      offCanvas.height = exportH;
      const offCtx = offCanvas.getContext("2d");

      if (offCtx && folder) {
        const scale = exportW / vbW;
        const stripeColor = cutBgType === "white" ? "#000000" : "#ffffff";
        const bgLabel =
          cutBgType === "transparent"
            ? "transparent-bg"
            : cutBgType === "white"
            ? "white-bg"
            : "black-bg";

        for (let f = 0; f < maxFrameCount; f++) {
          offCtx.clearRect(0, 0, exportW, exportH);
          if (cutBgType === "black") {
            offCtx.fillStyle = "#000000";
            offCtx.fillRect(0, 0, exportW, exportH);
          } else if (cutBgType === "white") {
            offCtx.fillStyle = "#ffffff";
            offCtx.fillRect(0, 0, exportW, exportH);
          }

          offCtx.save();
          offCtx.scale(scale, scale);
          offCtx.translate(-rootSvgViewBox.x, -rootSvgViewBox.y);

          activeZones.forEach((z) => {
            if (hiddenZoneIds[z.id]) return;
            const settings = zoneSettings[z.id];
            const geom = zonesGeometry[z.id];
            if (!settings || !geom || geom.polygon.length < 3) return;

            const zoneFrameCount = settings.frameCount || 6;
            const effectiveFrameIdx = f % zoneFrameCount;
            const framePhase = slicingPhase + effectiveFrameIdx / zoneFrameCount;

            const { lines, lineThickness } = generateLinesData(
              geom.bbox,
              settings,
              slicingScale,
              framePhase,
              cutStripeStyle === "bars"
            );

            if (lines.length === 0) return;

            offCtx.save();
            offCtx.beginPath();
            geom.polygon.forEach((pt, idx) => {
              if (idx === 0) offCtx.moveTo(pt.x, pt.y);
              else offCtx.lineTo(pt.x, pt.y);
            });
            offCtx.closePath();
            offCtx.clip();

            offCtx.strokeStyle = stripeColor;
            offCtx.lineWidth = lineThickness;
            offCtx.lineCap = "butt";

            lines.forEach((l) => {
              offCtx.beginPath();
              offCtx.moveTo(l.x1, l.y1);
              offCtx.lineTo(l.x2, l.y2);
              offCtx.stroke();
            });

            offCtx.restore();
          });

          offCtx.restore();

          const dataUrl = offCanvas.toDataURL("image/png");
          const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
          folder.file(
            `vinyl-top-cut-frame-${f + 1}-of-${maxFrameCount}-${bgLabel}-4K.png`,
            base64Data,
            { base64: true }
          );
        }

        const readme = `VINYL CUTTER / TOP LAYER CUT SPECIFICATIONS
Project: ${projectName}
Total Frames: ${maxFrameCount}
Active Curve Zones: ${activeZones.length}
Background Format: ${cutBgType.toUpperCase()}
Stripe Geometry: ${cutStripeStyle === "slits" ? "Single Slit Window (1 slice stripe per period)" : "Barrier Mask Bars"}
Image Resolution: 4096 x 4096 px (300+ DPI Ultra-HD)

INSTRUCTIONS FOR VINYL CUTTER / CRICUT / SILHOUETTE / LASER:
1. Import the PNG file into your cutting software (Cricut Design Space, Silhouette Studio, LightBurn, Roland CutStudio, Brother CanvasWorkspace).
2. If using Transparent PNG, the software will automatically trace the solid white stripes with no background weeding required.
3. If using White-on-Black PNG, choose "Complex Image" in Cricut Design Space and select the white stripe areas to cut.
4. Scale to match your target physical width/height.
`;
        folder.file("README-VINYL-CUTTER-SETTINGS.txt", readme);

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${projectName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}-vinyl-top-cut-all-frames-${bgLabel}-4K.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        if (showStatus) {
          showStatus(
            `Exported all ${maxFrameCount} Vinyl Cut Frame PNGs as a 4K ZIP!`,
            "success"
          );
        }
      }
    } catch (err: any) {
      alert(`ZIP export failed: ${err.message}`);
    } finally {
      setIsExportingCutZip(false);
    }
  };

  // Export Vector SVG for Vinyl Cutter (Frame specific)
  const handleExportTopLayerCutSvg = () => {
    try {
      let defs = "";
      let pathsContent = "";
      const stripeColor = cutBgType === "white" ? "#000000" : "#ffffff";
      const bgColor =
        cutBgType === "transparent" ? "none" : cutBgType === "white" ? "#ffffff" : "#000000";

      activeZones.forEach((z) => {
        if (hiddenZoneIds[z.id]) return;
        const settings = zoneSettings[z.id];
        const geom = zonesGeometry[z.id];
        if (!settings || !geom || geom.polygon.length < 3) return;

        const zoneFrameCount = settings.frameCount || 6;
        const effectiveFrameIdx = currentFrameIndex % zoneFrameCount;
        const framePhase = slicingPhase + effectiveFrameIdx / zoneFrameCount;

        const { lines, lineThickness } = generateLinesData(
          geom.bbox,
          settings,
          slicingScale,
          framePhase,
          cutStripeStyle === "bars"
        );

        if (lines.length === 0) return;

        const polyPointsStr = geom.polygon
          .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
          .join(" ");
        const clipId = `cut-clip-${z.id}`;
        defs += `
    <clipPath id="${clipId}">
      <polygon points="${polyPointsStr}" />
    </clipPath>`;

        let linesPathD = "";
        lines.forEach((l) => {
          linesPathD += `M ${l.x1.toFixed(2)} ${l.y1.toFixed(2)} L ${l.x2.toFixed(2)} ${l.y2.toFixed(2)} `;
        });

        pathsContent += `
    <!-- Zone ${settings.zoneName} Cut Stripes (Frame ${currentFrameIndex + 1}) -->
    <g clip-path="url(#${clipId})">
      <path d="${linesPathD.trim()}" stroke="${stripeColor}" stroke-width="${lineThickness.toFixed(
          2
        )}" stroke-linecap="butt" fill="none" />
    </g>`;
      });

      const svgDoc = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by [INTHE] BOX - Top Layer Vinyl Cut Mask (Frame ${currentFrameIndex + 1} of ${maxFrameCount}) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${rootSvgViewBox.x} ${rootSvgViewBox.y} ${
        rootSvgViewBox.width
      } ${rootSvgViewBox.height}" width="100%" height="100%">
  <defs>
    ${defs}
  </defs>
  ${bgColor !== "none" ? `<rect width="100%" height="100%" fill="${bgColor}" />` : ""}
  ${pathsContent}
</svg>`;

      const blob = new Blob([svgDoc], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${projectName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}-top-layer-cut-frame-${
        currentFrameIndex + 1
      }-vector.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      if (showStatus) {
        showStatus(`Exported Vinyl Cut Vector SVG (Frame #${currentFrameIndex + 1})`, "success");
      }
    } catch (err: any) {
      alert(`SVG export failed: ${err.message}`);
    }
  };

  // Export Complete Interlaced Bottom Layer SVG
  const handleExportInterlacedSvg = () => {
    try {
      let defs = "";
      let layersContent = "";

      activeZones.forEach((z) => {
        if (hiddenZoneIds[z.id]) return;
        const settings = zoneSettings[z.id];
        const geom = zonesGeometry[z.id];
        const artwork = zoneArtworks[z.id];
        if (!settings || !geom || geom.polygon.length < 3) return;

        const zoneFrameCount = settings.frameCount || 6;
        const polyPointsStr = geom.polygon.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        const clipContourId = `clip-contour-${z.id}`;

        defs += `
    <clipPath id="${clipContourId}">
      <polygon points="${polyPointsStr}" />
    </clipPath>`;

        for (let f = 0; f < zoneFrameCount; f++) {
          const frame = artwork?.frames?.[f];
          if (!frame) continue;

          const framePhase = slicingPhase + f / zoneFrameCount;
          const { lines, lineThickness } = generateLinesData(
            geom.bbox,
            settings,
            slicingScale,
            framePhase,
            false
          );

          if (lines.length === 0) continue;

          let pathD = "";
          lines.forEach((l) => {
            pathD += `M ${l.x1.toFixed(2)} ${l.y1.toFixed(2)} L ${l.x2.toFixed(2)} ${l.y2.toFixed(2)} `;
          });

          const clipSliceId = `clip-slice-${z.id}-f${f}`;
          defs += `
    <clipPath id="${clipSliceId}">
      <path d="${pathD.trim()}" stroke-width="${lineThickness.toFixed(2)}" stroke-linecap="butt" stroke="#fff" fill="none" />
    </clipPath>`;

          // Convert strokes to SVG path strings
          let strokesSvg = "";
          if (frame.strokes) {
            frame.strokes.forEach((stroke) => {
              if (stroke.points.length < 2) return;
              let d = `M ${stroke.points[0].x.toFixed(1)} ${stroke.points[0].y.toFixed(1)} `;
              for (let i = 1; i < stroke.points.length; i++) {
                d += `L ${stroke.points[i].x.toFixed(1)} ${stroke.points[i].y.toFixed(1)} `;
              }
              strokesSvg += `
        <path d="${d.trim()}" stroke="${stroke.color || '#00f0ff'}" stroke-width="${stroke.width || 4}" stroke-linecap="round" stroke-linejoin="round" fill="none" />`;
            });
          }

          layersContent += `
    <!-- Zone ${settings.zoneName} - Frame ${f + 1} Slices -->
    <g clip-path="url(#${clipContourId})">
      <g clip-path="url(#${clipSliceId})">
        ${strokesSvg}
      </g>
    </g>`;
        }
      });

      const svgDoc = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by [INTHE] BOX - Stitched Interlaced Scanimation Bottom Layer -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${rootSvgViewBox.x} ${rootSvgViewBox.y} ${rootSvgViewBox.width} ${rootSvgViewBox.height}" width="100%" height="100%">
  <defs>
    ${defs}
  </defs>
  <rect width="100%" height="100%" fill="${canvasBg === 'dark' ? '#000000' : '#ffffff'}" />
  ${layersContent}
</svg>`;

      const blob = new Blob([svgDoc], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-stitched-interlaced-bottom-layer.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (showStatus) showStatus("Exported Complete Stitched Interlaced SVG", "success");
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    }
  };

  // Export All Sliced Frames as a ZIP
  const handleExportAllFramesZip = async () => {
    setIsExportingZip(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(`${projectName}-stitched-frames`);
      const maxDim = 1600;
      const vbW = Math.max(1, rootSvgViewBox.width);
      const vbH = Math.max(1, rootSvgViewBox.height);
      let exportW = maxDim;
      let exportH = maxDim;
      if (vbW >= vbH) {
        exportW = maxDim;
        exportH = Math.max(1, Math.round((maxDim * vbH) / vbW));
      } else {
        exportH = maxDim;
        exportW = Math.max(1, Math.round((maxDim * vbW) / vbH));
      }

      // Offscreen canvas for rendering each frame cleanly
      const offCanvas = document.createElement("canvas");
      offCanvas.width = exportW;
      offCanvas.height = exportH;
      const offCtx = offCanvas.getContext("2d");

      if (offCtx && folder) {
        const scale = exportW / vbW;

        for (let f = 0; f < maxFrameCount; f++) {
          offCtx.clearRect(0, 0, exportW, exportH);
          if (canvasBg === "dark") {
            offCtx.fillStyle = "#000000";
            offCtx.fillRect(0, 0, exportW, exportH);
          } else {
            offCtx.fillStyle = "#ffffff";
            offCtx.fillRect(0, 0, exportW, exportH);
          }

          offCtx.save();
          offCtx.scale(scale, scale);
          offCtx.translate(-rootSvgViewBox.x, -rootSvgViewBox.y);

          // Render curves for frame f
          activeZones.forEach((z) => {
            if (hiddenZoneIds[z.id]) return;
            const settings = zoneSettings[z.id];
            const geom = zonesGeometry[z.id];
            const artwork = zoneArtworks[z.id];
            if (!settings || !geom || geom.polygon.length < 3) return;

            const zoneFrameCount = settings.frameCount || 6;
            const frame = artwork?.frames?.[f % zoneFrameCount];
            if (!frame) return;

            offCtx.save();
            offCtx.beginPath();
            geom.polygon.forEach((pt, idx) => {
              if (idx === 0) offCtx.moveTo(pt.x, pt.y);
              else offCtx.lineTo(pt.x, pt.y);
            });
            offCtx.closePath();
            offCtx.clip();

            renderSingleFrameContent(offCtx, frame, geom);
            offCtx.restore();
          });

          offCtx.restore();

          const dataUrl = offCanvas.toDataURL("image/png");
          const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
          folder.file(`frame-${f + 1}-of-${maxFrameCount}.png`, base64Data, { base64: true });
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-stitched-all-frames.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        if (showStatus) showStatus(`Generated ZIP with all ${maxFrameCount} stitched frames!`, "success");
      }
    } catch (err: any) {
      alert(`ZIP generation failed: ${err.message}`);
    } finally {
      setIsExportingZip(false);
    }
  };

  // Count active artwork stats
  const totalStrokes = useMemo(() => {
    let count = 0;
    activeZones.forEach((z) => {
      const art = zoneArtworks[z.id];
      if (art && art.frames) {
        art.frames.forEach((f) => {
          count += f.strokes?.length || 0;
        });
      }
    });
    return count;
  }, [activeZones, zoneArtworks]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/95 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div className="bg-[#0c0c0c] border border-[#262626] rounded-none w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden shadow-2xl font-mono">
        {/* 1. Header Toolbar */}
        <header className="h-14 border-b border-[#262626] bg-black px-4 md:px-6 flex items-center justify-between shrink-0 gap-3">
          <div className="flex items-center gap-3">
            <CruciformIcon className="w-5 h-5 text-[#00f0ff]" glow />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold tracking-widest text-[#00f0ff] uppercase">
                  STITCHED ARTWORK FRAME-BY-FRAME PREVIEW
                </span>
                <span className="text-[10px] bg-[#ff007f]/20 border border-[#ff007f]/50 text-[#ff007f] px-1.5 py-0.2 font-bold">
                  {activeZones.length} CURVES // {maxFrameCount} FRAMES
                </span>
              </div>
              <p className="text-[9.5px] text-stone-500 font-mono uppercase truncate hidden sm:block">
                Composite motion slices & optical parallax stitcher // {totalStrokes} total vector strokes
              </p>
            </div>
          </div>

          {/* Right Action & Close */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPreviewMode("top_layer_cut")}
              className={`p-1.5 px-3 border text-[11px] font-black flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                previewMode === "top_layer_cut"
                  ? "bg-white text-black border-white shadow-[0_0_12px_rgba(255,255,255,0.6)]"
                  : "bg-[#141414] hover:bg-[#202020] border-white/40 text-white"
              }`}
              title="Single solid white on black slice cut mask for vinyl cutter / plotter export"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>TOP LAYER CUT</span>
            </button>

            <button
              onClick={handleExportInterlacedSvg}
              className="p-1.5 px-3 bg-[#111] hover:bg-[#1a1a1a] border border-[#00f0ff]/40 hover:border-[#00f0ff] text-[#00f0ff] text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
              title="Export complete interlaced bottom layer SVG ready for multi-directional print"
            >
              <Download className="w-3.5 h-3.5 text-[#00f0ff]" />
              <span className="hidden md:inline">EXPORT INTERLACED SVG</span>
            </button>

            <button
              onClick={handleExportAllFramesZip}
              disabled={isExportingZip}
              className="p-1.5 px-3 bg-gradient-to-r from-[#ff007f] to-[#b026ff] hover:opacity-90 text-white text-[11px] font-black flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
              title="Download all stitched frames as a ZIP archive"
            >
              <FileArchive className="w-3.5 h-3.5 text-white" />
              <span>{isExportingZip ? "PACKING..." : "EXPORT ALL FRAMES ZIP"}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 bg-[#141414] hover:bg-[#222] border border-[#333] hover:border-white text-stone-400 hover:text-white cursor-pointer ml-1"
              title="Close Preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 2. Mode Tabs Bar */}
        <div className="h-11 bg-[#111] border-b border-[#262626] px-4 flex items-center justify-between text-xs overflow-x-auto gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-stone-500 font-bold mr-2 uppercase hidden lg:inline">
              VIEWING MODE:
            </span>

            <button
              onClick={() => setPreviewMode("top_layer_cut")}
              className={`p-1 px-3 text-[11px] font-black border transition-all cursor-pointer flex items-center gap-1.5 ${
                previewMode === "top_layer_cut"
                  ? "bg-white text-black border-white shadow-[0_0_14px_rgba(255,255,255,0.7)]"
                  : "bg-[#181818] border-[#333] text-stone-200 hover:text-white hover:border-white/60"
              }`}
              title="Single solid white on black slice cut mask for vinyl cutters, Cricut, and Silhouette"
            >
              <Scissors className="w-3.5 h-3.5 text-inherit" />
              <span>TOP LAYER CUT (VINYL MASK)</span>
            </button>

            <button
              onClick={() => setPreviewMode("simulation")}
              className={`p-1 px-3 text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                previewMode === "simulation"
                  ? "bg-[#00f0ff]/20 border-[#00f0ff] text-[#00f0ff] shadow-[0_0_8px_rgba(0,240,255,0.2)]"
                  : "bg-[#181818] border-[#2a2a2a] text-stone-400 hover:text-stone-200"
              }`}
              title="Interactive optical barrier scanimation simulation"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#00f0ff]" />
              <span>OPTICAL SLIT SIMULATION</span>
            </button>

            <button
              onClick={() => setPreviewMode("clean")}
              className={`p-1 px-3 text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                previewMode === "clean"
                  ? "bg-[#ff007f]/20 border-[#ff007f] text-[#ff007f] shadow-[0_0_8px_rgba(255,0,127,0.2)]"
                  : "bg-[#181818] border-[#2a2a2a] text-stone-400 hover:text-stone-200"
              }`}
              title="View clean composite animation frame by frame across all curves"
            >
              <Film className="w-3.5 h-3.5 text-[#ff007f]" />
              <span>FRAME-BY-FRAME ANIMATION</span>
            </button>

            <button
              onClick={() => setPreviewMode("interlaced")}
              className={`p-1 px-3 text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                previewMode === "interlaced"
                  ? "bg-[#00ff88]/20 border-[#00ff88] text-[#00ff88] shadow-[0_0_8px_rgba(0,255,136,0.2)]"
                  : "bg-[#181818] border-[#2a2a2a] text-stone-400 hover:text-stone-200"
              }`}
              title="View full stitched interlaced bottom sheet"
            >
              <Layers className="w-3.5 h-3.5 text-[#00ff88]" />
              <span>INTERLACED BOTTOM SHEET</span>
            </button>

            <button
              onClick={() => setPreviewMode("frame_slices")}
              className={`p-1 px-3 text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                previewMode === "frame_slices"
                  ? "bg-[#ffd700]/20 border-[#ffd700] text-[#ffd700]"
                  : "bg-[#181818] border-[#2a2a2a] text-stone-400 hover:text-stone-200"
              }`}
              title="View isolated physical ink slices for the active frame"
            >
              <Scissors className="w-3.5 h-3.5 text-[#ffd700]" />
              <span>SINGLE FRAME SLICES</span>
            </button>
          </div>

          {/* Background Toggle & Canvas Controls */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-stone-500 font-bold uppercase hidden sm:inline">PAPER:</span>
            <div className="flex border border-[#2a2a2a] p-0.5 bg-[#141414]">
              <button
                onClick={() => setCanvasBg("dark")}
                className={`px-2 py-0.5 text-[10px] font-bold cursor-pointer ${
                  canvasBg === "dark" ? "bg-black text-[#00f0ff]" : "text-stone-500 hover:text-stone-300"
                }`}
              >
                DARK
              </button>
              <button
                onClick={() => setCanvasBg("light")}
                className={`px-2 py-0.5 text-[10px] font-bold cursor-pointer ${
                  canvasBg === "light" ? "bg-white text-black" : "text-stone-500 hover:text-stone-300"
                }`}
              >
                LIGHT
              </button>
            </div>

            <button
              onClick={handleExportCurrentFramePng}
              className="p-1 px-2.5 bg-[#181818] hover:bg-[#222] border border-[#333] text-stone-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              title="Download Current Frame as High-Res PNG"
            >
              <Download className="w-3 h-3 text-[#00f0ff]" />
              <span className="hidden sm:inline">PNG</span>
            </button>
          </div>
        </div>

        {/* 3. Main Body */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden relative">
          {/* Center: Stage Canvas Viewport */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#060606] relative">
            {/* Top Viewport Floating Controls: Top Layer Cut Mode (Vinyl Mask) */}
            {previewMode === "top_layer_cut" && (
              <div className="absolute top-3 left-3 right-3 z-30 bg-black/90 backdrop-blur-md border border-white/30 p-2 px-3 flex items-center justify-between gap-3 flex-wrap shadow-2xl">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Scissors className="w-4 h-4 text-white" />
                    <span className="text-[11px] font-black text-white uppercase tracking-wider">
                      TOP LAYER CUT (VINYL MASK):
                    </span>
                  </div>

                  {/* Choice to remove black background */}
                  <div className="flex items-center gap-1 bg-[#141414] border border-[#333] p-0.5">
                    <button
                      onClick={() => setCutBgType("black")}
                      className={`px-2 py-1 text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                        cutBgType === "black"
                          ? "bg-black text-white border border-white/50 shadow-sm font-black"
                          : "text-stone-400 hover:text-stone-200"
                      }`}
                      title="Solid black background with solid white single slices"
                    >
                      <span className="w-2.5 h-2.5 bg-black border border-white/60 inline-block" />
                      <span>WHITE ON BLACK</span>
                    </button>
                    <button
                      onClick={() => setCutBgType("transparent")}
                      className={`px-2 py-1 text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                        cutBgType === "transparent"
                          ? "bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/70 font-black shadow-[0_0_8px_rgba(0,240,255,0.3)]"
                          : "text-stone-400 hover:text-stone-200"
                      }`}
                      title="Remove black background (100% transparent alpha) - Solid white stripes only for easy vinyl cutter import"
                    >
                      <span className="w-2.5 h-2.5 bg-gradient-to-tr from-stone-500 to-stone-300 inline-block border border-stone-400" />
                      <span>TRANSPARENT (NO BG)</span>
                    </button>
                    <button
                      onClick={() => setCutBgType("white")}
                      className={`px-2 py-1 text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                        cutBgType === "white"
                          ? "bg-white text-black font-black"
                          : "text-stone-400 hover:text-stone-200"
                      }`}
                      title="Inverted: Solid black slices on white background"
                    >
                      <span className="w-2.5 h-2.5 bg-white border border-black inline-block" />
                      <span>INVERTED (B/W)</span>
                    </button>
                  </div>

                  {/* Slices vs Barrier Bars */}
                  <div className="flex items-center gap-1 bg-[#141414] border border-[#333] p-0.5">
                    <button
                      onClick={() => setCutStripeStyle("slits")}
                      className={`px-2 py-1 text-[10px] font-bold cursor-pointer transition-colors ${
                        cutStripeStyle === "slits"
                          ? "bg-white text-black font-black"
                          : "text-stone-400 hover:text-stone-200"
                      }`}
                      title="Single slit stripe per frame period window"
                    >
                      SINGLE SLICES
                    </button>
                    <button
                      onClick={() => setCutStripeStyle("bars")}
                      className={`px-2 py-1 text-[10px] font-bold cursor-pointer transition-colors ${
                        cutStripeStyle === "bars"
                          ? "bg-white text-black font-black"
                          : "text-stone-400 hover:text-stone-200"
                      }`}
                      title="Solid barrier mask bars"
                    >
                      BARRIER BARS
                    </button>
                  </div>
                </div>

                {/* Export Actions for Top Layer Cut */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExportTopLayerCutPng(4096)}
                    className="p-1 px-3 bg-white hover:bg-stone-200 text-black text-[11px] font-black flex items-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(255,255,255,0.4)] active:scale-95"
                    title="Download ultra-sharp 4096px 300+ DPI PNG of this single slice frame"
                  >
                    <Download className="w-3.5 h-3.5 text-black" />
                    <span>4K PNG (FRAME #{currentFrameIndex + 1})</span>
                  </button>

                  <button
                    onClick={handleExportAllCutFramesZip}
                    disabled={isExportingCutZip}
                    className="p-1 px-2.5 bg-[#1a1a1a] hover:bg-[#252525] border border-white/40 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    title="Export all frame cut masks into a ZIP package"
                  >
                    <FileArchive className="w-3 h-3 text-white" />
                    <span>{isExportingCutZip ? "PACKING..." : "ALL FRAMES ZIP"}</span>
                  </button>

                  <button
                    onClick={handleExportTopLayerCutSvg}
                    className="p-1 px-2 bg-[#1a1a1a] hover:bg-[#252525] border border-stone-600 text-stone-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    title="Download Vector SVG paths for Cricut / Silhouette"
                  >
                    <span>SVG</span>
                  </button>
                </div>
              </div>
            )}

            {/* Top Viewport Floating Controls: Slit Simulation */}
            {previewMode === "simulation" && (
              <div className="absolute top-3 left-3 right-3 z-30 bg-black/80 backdrop-blur-md border border-[#262626] p-2 px-3 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                  <span className="text-[10px] font-bold text-[#00f0ff] shrink-0">SLIT BARRIER SLIDE:</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={slitPhase}
                    onChange={(e) => setSlitPhase(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-[#1a1a1a] accent-[#00f0ff] cursor-pointer"
                  />
                  <span className="text-[10px] text-stone-400 w-10 text-right">
                    {(slitPhase * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-stone-500 font-bold uppercase">MASK DENSITY:</span>
                  <input
                    type="range"
                    min="0.3"
                    max="1"
                    step="0.05"
                    value={slitOpacity}
                    onChange={(e) => setSlitOpacity(parseFloat(e.target.value))}
                    className="w-20 h-1.5 bg-[#1a1a1a] accent-[#ff007f] cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Canvas Container */}
            <div
              ref={containerRef}
              className="flex-1 flex items-center justify-center p-4 overflow-hidden relative"
            >
              <div
                style={{
                  transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                  transition: "transform 0.1s ease-out",
                  aspectRatio: canvasDimensions.aspectRatio,
                }}
                className={`relative w-full h-full max-w-[700px] max-h-[700px] border border-[#262626] shadow-2xl flex items-center justify-center ${
                  previewMode === "top_layer_cut" && cutBgType === "transparent"
                    ? "bg-[radial-gradient(#333_1px,transparent_1px)] bg-[size:12px_12px] bg-[#0c0c0c]"
                    : "bg-black"
                }`}
              >
                <canvas
                  ref={canvasRef}
                  width={canvasDimensions.width}
                  height={canvasDimensions.height}
                  className="w-full h-full object-contain relative z-20"
                />

                {/* Frame Badge Overlay */}
                <div className="absolute bottom-2 left-2 z-30 bg-black/85 border border-[#333] px-2.5 py-1 flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-[#00f0ff]">
                    FRAME {currentFrameIndex + 1} OF {maxFrameCount}
                  </span>
                  <span className="text-[9px] text-stone-400 font-mono">
                    // MODE: {previewMode.toUpperCase()}
                  </span>
                  {previewMode === "top_layer_cut" && (
                    <span className="text-[9px] text-white font-mono bg-white/10 px-1 py-0.5 border border-white/30">
                      BG: {cutBgType.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Viewport Zoom Overlay */}
            <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1 bg-black/85 border border-[#262626] p-1">
              <button
                onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
                className="p-1 text-stone-400 hover:text-white cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] px-1 text-stone-300">{(zoom * 100).toFixed(0)}%</span>
              <button
                onClick={() => setZoom((z) => Math.min(4, z + 0.2))}
                className="p-1 text-stone-400 hover:text-white cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="p-1 text-stone-400 hover:text-[#00f0ff] cursor-pointer"
                title="Reset Zoom"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Right Sidebar: Curves Status & Layer Toggles */}
          <div className="w-full md:w-80 bg-[#0d0d0d] border-t md:border-t-0 md:border-l border-[#262626] flex flex-col shrink-0">
            {previewMode === "top_layer_cut" && (
              <div className="p-3 border-b border-white/20 bg-white/5 space-y-2">
                <div className="flex items-center gap-2">
                  <Scissors className="w-3.5 h-3.5 text-white" />
                  <span className="text-xs font-black text-white uppercase tracking-wider">
                    VINYL CUTTER GUIDE
                  </span>
                </div>
                <p className="text-[9px] text-stone-300 leading-relaxed font-sans">
                  Export single white stripes for Cricut, Silhouette, Roland, or Laser cutter top sheet masks.
                </p>
                <div className="grid grid-cols-2 gap-1.5 text-[9px] font-mono pt-1">
                  <div className="p-1 bg-black/60 border border-[#333]">
                    <span className="text-stone-400 block">RESOLUTION:</span>
                    <span className="text-white font-bold">4096px (300+ DPI)</span>
                  </div>
                  <div className="p-1 bg-black/60 border border-[#333]">
                    <span className="text-stone-400 block">ALPHA BG:</span>
                    <span className="text-[#00f0ff] font-bold">
                      {cutBgType === "transparent" ? "ENABLED (NO BG)" : "DISABLED"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="p-3 border-b border-[#262626] bg-black flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-[#00f0ff]" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  STITCHED CURVES ({activeZones.length})
                </span>
              </div>
              <span className="text-[9px] text-stone-500 font-mono">SOLO / MUTE</span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {activeZones.map((z) => {
                const settings = zoneSettings[z.id];
                const artwork = zoneArtworks[z.id];
                const isHidden = hiddenZoneIds[z.id];
                const frameCount = settings?.frameCount || 6;
                const framesWithData =
                  artwork?.frames?.filter((f) => f.strokes?.length > 0 || f.imageDataUrl).length || 0;

                return (
                  <div
                    key={z.id}
                    className={`p-2 border transition-all ${
                      isHidden
                        ? "bg-[#111] border-[#222] opacity-50"
                        : "bg-[#141414] border-[#262626] hover:border-[#00f0ff]/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <button
                          onClick={() =>
                            setHiddenZoneIds((prev) => ({
                              ...prev,
                              [z.id]: !prev[z.id],
                            }))
                          }
                          className={`p-1 text-stone-400 hover:text-white cursor-pointer ${
                            isHidden ? "text-stone-600" : "text-[#00f0ff]"
                          }`}
                          title={isHidden ? "Show curve in preview" : "Hide curve from preview"}
                        >
                          {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <span className="text-xs font-bold text-stone-200 truncate">
                          {settings?.zoneName || z.defaultName}
                        </span>
                      </div>

                      {/* Jump to draw in Artwork Studio */}
                      {onOpenArtworkStudio && (
                        <button
                          onClick={() => {
                            onClose();
                            onOpenArtworkStudio(z.id);
                          }}
                          className="p-1 px-2 text-[9px] font-bold bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] hover:border-[#00f0ff] text-[#00f0ff] flex items-center gap-1 cursor-pointer"
                          title="Open in Frame Artwork Studio to edit drawing"
                        >
                          <Palette className="w-2.5 h-2.5" />
                          <span>EDIT</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[9px] text-stone-400 mt-1 pl-6">
                      <span>ANGLE: {settings?.revealDirection?.angle ?? 0}°</span>
                      <span
                        className={
                          framesWithData > 0
                            ? "text-[#00f0ff] font-bold"
                            : "text-stone-600 font-normal"
                        }
                      >
                        {framesWithData}/{frameCount} FRAMES DRAWN
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4. Bottom Frame-by-Frame Scrub & Filmstrip Timeline */}
        <div className="h-36 bg-[#0a0a0a] border-t border-[#262626] p-3 flex flex-col justify-between shrink-0 z-30">
          {/* Timeline Header Controls */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              {/* Play / Pause */}
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`p-1.5 px-4 font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                  isPlaying
                    ? "bg-[#ff007f] text-white border border-[#ff007f] shadow-[0_0_12px_rgba(255,0,127,0.4)]"
                    : "bg-[#00f0ff] text-black border border-[#00f0ff] shadow-[0_0_12px_rgba(0,240,255,0.3)]"
                }`}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? "PAUSE PREVIEW" : "PLAY COMPOSITE"}</span>
              </button>

              {/* Step Navigation */}
              <button
                onClick={() =>
                  setCurrentFrameIndex((prev) => (prev > 0 ? prev - 1 : maxFrameCount - 1))
                }
                className="p-1.5 bg-[#141414] hover:bg-[#222] border border-[#262626] text-stone-300 cursor-pointer"
                title="Previous Frame"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <span className="text-stone-200 font-bold text-sm px-1">
                {currentFrameIndex + 1} / {maxFrameCount}
              </span>

              <button
                onClick={() =>
                  setCurrentFrameIndex((prev) => (prev < maxFrameCount - 1 ? prev + 1 : 0))
                }
                className="p-1.5 bg-[#141414] hover:bg-[#222] border border-[#262626] text-stone-300 cursor-pointer"
                title="Next Frame"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              {/* FPS Selector */}
              <div className="flex items-center gap-1.5 ml-2">
                <span className="text-[10px] text-stone-500 font-bold">SPEED:</span>
                {[1, 3, 6, 12, 24].map((fps) => (
                  <button
                    key={fps}
                    onClick={() => setPlaybackFps(fps)}
                    className={`px-1.5 py-0.5 text-[9px] font-mono border cursor-pointer ${
                      playbackFps === fps
                        ? "bg-[#00f0ff]/20 border-[#00f0ff] text-[#00f0ff] font-bold"
                        : "bg-[#111] border-[#333] text-stone-400"
                    }`}
                  >
                    {fps} FPS
                  </button>
                ))}
              </div>
            </div>

            {/* Frame Scrubber Slider */}
            <div className="hidden lg:flex items-center gap-2 flex-1 max-w-xs mx-4">
              <span className="text-[10px] text-stone-500 font-bold">SCRUB:</span>
              <input
                type="range"
                min="0"
                max={maxFrameCount - 1}
                step="1"
                value={currentFrameIndex}
                onChange={(e) => setCurrentFrameIndex(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-[#1a1a1a] accent-[#00f0ff] cursor-pointer"
              />
            </div>

            {/* Export Current Frame Quick Button */}
            <button
              onClick={handleExportCurrentFramePng}
              className="p-1 px-3 bg-[#141414] hover:bg-[#222] border border-[#262626] hover:border-[#00f0ff]/40 text-stone-300 text-[10px] font-bold flex items-center gap-1.5 cursor-pointer"
              title="Download snapshot of current stitched frame"
            >
              <Download className="w-3 h-3 text-[#00f0ff]" />
              <span>SAVE FRAME #{currentFrameIndex + 1}</span>
            </button>
          </div>

          {/* Filmstrip Frame Buttons */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 mt-2">
            {Array.from({ length: maxFrameCount }).map((_, idx) => {
              const isSelected = idx === currentFrameIndex;

              // Check if any curve has drawing for this frame
              const activeCount = activeZones.filter((z) => {
                const count = zoneSettings[z.id]?.frameCount || 6;
                const frame = zoneArtworks[z.id]?.frames?.[idx % count];
                return frame && (frame.strokes?.length > 0 || frame.imageDataUrl);
              }).length;

              return (
                <button
                  key={idx}
                  onClick={() => {
                    setCurrentFrameIndex(idx);
                    if (isPlaying) setIsPlaying(false);
                  }}
                  className={`flex-1 min-w-[75px] max-w-[120px] h-14 border flex flex-col items-center justify-between p-1.5 transition-all cursor-pointer relative ${
                    isSelected
                      ? "bg-[#00f0ff]/15 border-[#00f0ff] text-white shadow-[0_0_10px_rgba(0,240,255,0.25)] scale-[1.02]"
                      : "bg-[#111] border-[#222] text-stone-400 hover:border-[#333]"
                  }`}
                >
                  <div className="w-full flex items-center justify-between text-[10px] font-bold">
                    <span className={isSelected ? "text-[#00f0ff]" : "text-stone-300"}>
                      F{idx + 1}
                    </span>
                    {activeCount > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff]" />
                    )}
                  </div>

                  <div className="text-[8.5px] text-stone-500 font-mono">
                    {activeCount > 0 ? `${activeCount} curves active` : "Empty"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
