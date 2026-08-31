/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  ArrowLeft, Palette, Image as ImageIcon, Film, Play, Pause, 
  RotateCcw, Undo2, Redo2, Trash2, Copy, Plus, ChevronLeft, ChevronRight,
  Sliders, Eye, EyeOff, Layers, Sparkles, Check, Upload, Move,
  Maximize2, ZoomIn, ZoomOut, Download, AlertCircle, Compass, HelpCircle,
  Hand, CopyCheck
} from "lucide-react";
import { ZoneSettings, SVGZoneInfo, ZoneArtwork, FrameArtwork, DrawStroke, DrawPoint, ImageTransform } from "../types";
import { GifTrimmerModal } from "./GifTrimmerModal";
import { GiphySearchModal } from "./GiphySearchModal";
import { CopyFrameModal } from "./CopyFrameModal";
import { MotionChoreographyModal } from "./MotionChoreographyModal";
import { StudioRightSidebar } from "./StudioRightSidebar";
import { TransformGumball } from "./TransformGumball";
import { UploadGifModal } from "./UploadGifModal";
import { CruciformIcon } from "./CruciformIcon";
import { getPolygonFromElement, getShapeGeometry } from "../utils/slicing";
import { renderFrameToCanvas } from "../utils/artworkSlicing";
import { extractSampledPoints, densifyPoints, drawSmoothStroke } from "../utils/drawingSmoothing";
import { analyzeShapeGeometry, generateMotionRecommendations, CreatureMotionArchetype } from "../utils/motionSuggester";

interface FrameArtworkStageProps {
  onBackToMapper: () => void;
  zones: SVGZoneInfo[];
  zoneSettings: Record<string, ZoneSettings>;
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
  zoneArtworks: Record<string, ZoneArtwork>;
  onUpdateZoneArtwork: (zoneId: string, artwork: ZoneArtwork) => void;
  onOpenSeeAllPreview: () => void;
  svgContent?: string | null;
  projectName?: string;
  showStatus?: (text: string, type?: "success" | "error" | "info") => void;
  slicingScale?: number;
  slicingPhase?: number;
  onUpdateZoneSettings?: (settings: ZoneSettings) => void;
  onRenameZone?: (zoneId: string, newName: string) => void;
  onChangeZoneFrames?: (zoneId: string, count: number) => void;
}

export function FrameArtworkStage({
  onBackToMapper,
  zones,
  zoneSettings,
  selectedZoneId,
  onSelectZone,
  zoneArtworks,
  onUpdateZoneArtwork,
  onOpenSeeAllPreview,
  svgContent = null,
  projectName = "Artwork",
  showStatus,
  slicingScale = 1.0,
  slicingPhase = 0.0,
  onUpdateZoneSettings,
  onRenameZone,
  onChangeZoneFrames,
}: FrameArtworkStageProps) {
  // Ensure we only have active animated zones selected (excluding Rect #1 and solid static curves with 0-1 frames)
  const activeZones = zones.filter((z) => {
    const isRect1 = z.defaultName === "Rect #1" || (z.tagName === "rect" && z.id === "zone-0");
    if (isRect1) return false;
    const settings = zoneSettings[z.id];
    const isSolid = !!settings?.isSolid || (settings?.frameCount !== undefined && settings.frameCount <= 1);
    return !isSolid;
  });

  const currentZone = activeZones.find((z) => z.id === selectedZoneId) || activeZones[0] || null;
  const currentSettings = currentZone ? zoneSettings[currentZone.id] : null;
  const frameCount = currentSettings?.frameCount || 6;

  // Active frame index (0-based) for the selected zone
  const [activeFrameIndex, setActiveFrameIndex] = useState<number>(0);

  // Drawing Tools State ("brush" | "eraser" | "pan" | "transform")
  const [currentTool, setCurrentTool] = useState<"brush" | "eraser" | "pan" | "transform">("brush");
  const [brushColor, setBrushColor] = useState<string>("#00f0ff");
  const [brushSize, setBrushSize] = useState<number>(5);
  const [onionSkinning, setOnionSkinning] = useState<boolean>(false);
  const [onionOpacity, setOnionOpacity] = useState<number>(0.35);
  const [clipToContour, setClipToContour] = useState<boolean>(true);
  const [showContourOutline, setShowContourOutline] = useState<boolean>(true);

  // Undo / Redo history for current frame
  const [undoStack, setUndoStack] = useState<DrawStroke[][]>([]);
  const [redoStack, setRedoStack] = useState<DrawStroke[][]>([]);

  // Animation playback state for this curve
  const [isPlayingCurve, setIsPlayingCurve] = useState<boolean>(false);
  const [playbackFps, setPlaybackFps] = useState<number>(6);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  // GIF Trimmer Modal state
  const [isGifTrimmerOpen, setIsGifTrimmerOpen] = useState<boolean>(false);

  // Giphy Search & Auto-Slicer Modal state
  const [isGiphyModalOpen, setIsGiphyModalOpen] = useState<boolean>(false);

  // Copy Frame Artwork Modal state
  const [isCopyModalOpen, setIsCopyModalOpen] = useState<boolean>(false);
  const [copyModalSourceIndex, setCopyModalSourceIndex] = useState<number>(0);

  // Motion Advisor Modal state
  const [isMotionModalOpen, setIsMotionModalOpen] = useState<boolean>(false);

  // Custom Upload GIF Modal state
  const [isUploadGifModalOpen, setIsUploadGifModalOpen] = useState<boolean>(false);

  // Live motion analysis for current curve
  const motionAnalysis = useMemo(() => {
    if (!currentZone || !currentSettings) return null;
    const el = document.querySelector<SVGElement>(`[data-zone-id="${currentZone.id}"]`);
    const metrics = analyzeShapeGeometry(el, currentSettings);
    return generateMotionRecommendations(metrics, currentSettings);
  }, [currentZone?.id, currentSettings]);

  // Image Upload Ref
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Canvas Refs & Interaction State
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef<boolean>(false);
  const currentStrokeRef = useRef<DrawStroke | null>(null);
  const stageContainerRef = useRef<HTMLDivElement>(null);

  // Image Transform state & drag refs
  const [syncTransformToAll, setSyncTransformToAll] = useState<boolean>(true);
  const isTransformingRef = useRef<boolean>(false);
  const transformStartRef = useRef<{
    clientX: number;
    clientY: number;
    startX: number;
    startY: number;
  } | null>(null);

  // Zoom & Pan State (Zoom up to 1600% / 16.0x)
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; startPanX: number; startPanY: number } | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);

  // Auto-select first zone if none selected
  useEffect(() => {
    if (!selectedZoneId && activeZones.length > 0) {
      onSelectZone(activeZones[0].id);
    }
  }, [selectedZoneId, activeZones, onSelectZone]);

  // Reset Zoom & Pan when switching curves or extents mode
  useEffect(() => {
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
  }, [currentZone?.id]);

  // Spacebar panning shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !isSpacePressed &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)
      ) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isSpacePressed]);

  // Current zone artwork data
  const currentZoneArtwork: ZoneArtwork = useMemo(() => {
    if (!currentZone) {
      return { zoneId: "", frames: [], activeFrameIndex: 0 };
    }
    const existing = zoneArtworks[currentZone.id];
    if (existing && existing.frames.length === frameCount) {
      return existing;
    }
    // Initialize or adjust frames array to match current frameCount
    const frames: FrameArtwork[] = [];
    for (let i = 0; i < frameCount; i++) {
      if (existing && existing.frames[i]) {
        frames.push(existing.frames[i]);
      } else {
        frames.push({
          frameIndex: i,
          strokes: [],
        });
      }
    }
    return {
      zoneId: currentZone.id,
      frames,
      activeFrameIndex: Math.min(activeFrameIndex, frameCount - 1),
      onionSkinning,
      onionSkinOpacity: onionOpacity,
    };
  }, [currentZone, zoneArtworks, frameCount, activeFrameIndex, onionSkinning, onionOpacity]);

  // Current active frame
  const currentFrame: FrameArtwork = currentZoneArtwork.frames[activeFrameIndex] || {
    frameIndex: activeFrameIndex,
    strokes: [],
  };

  // Bounds & Polygon geometry of current zone from raw DOM
  const [zoneGeometry, setZoneGeometry] = useState<{
    bbox: { x: number; y: number; width: number; height: number };
    polygon: { x: number; y: number }[];
    viewBox: { x: number; y: number; width: number; height: number };
  }>({
    bbox: { x: 50, y: 50, width: 300, height: 300 },
    polygon: [],
    viewBox: { x: 0, y: 0, width: 500, height: 500 },
  });

  // Zoom to curve extents toggle
  const [zoomToCurve, setZoomToCurve] = useState<boolean>(true);

  // Base bounding view before custom zoom & pan
  const baseViewBox = useMemo(() => {
    if (zoomToCurve && zoneGeometry.bbox.width > 0 && zoneGeometry.bbox.height > 0) {
      const pad = Math.max(zoneGeometry.bbox.width, zoneGeometry.bbox.height) * 0.28;
      const minDim = Math.max(zoneGeometry.bbox.width, zoneGeometry.bbox.height) + pad * 2;
      const cx = zoneGeometry.bbox.x + zoneGeometry.bbox.width / 2;
      const cy = zoneGeometry.bbox.y + zoneGeometry.bbox.height / 2;
      return {
        cx,
        cy,
        width: minDim,
        height: minDim,
      };
    }
    const vb = zoneGeometry.viewBox.width > 0 ? zoneGeometry.viewBox : { x: 0, y: 0, width: 500, height: 500 };
    const maxDim = Math.max(vb.width, vb.height);
    return {
      cx: vb.x + vb.width / 2,
      cy: vb.y + vb.height / 2,
      width: maxDim,
      height: maxDim,
    };
  }, [zoomToCurve, zoneGeometry]);

  // Active view box factoring in zoomLevel (magnification) and panOffset
  const activeViewBox = useMemo(() => {
    const effectiveW = baseViewBox.width / zoomLevel;
    const effectiveH = baseViewBox.height / zoomLevel;
    const cx = baseViewBox.cx + panOffset.x;
    const cy = baseViewBox.cy + panOffset.y;

    return {
      x: cx - effectiveW / 2,
      y: cy - effectiveH / 2,
      width: effectiveW,
      height: effectiveH,
    };
  }, [baseViewBox, zoomLevel, panOffset]);

  // Extract geometry when currentZone or svgContent changes
  useEffect(() => {
    if (!currentZone) return;

    try {
      let el = document.querySelector(`[data-zone-id="${currentZone.id}"]`) as SVGElement;
      let tempDiv: HTMLDivElement | null = null;

      if (!el && svgContent) {
        tempDiv = document.createElement("div");
        tempDiv.style.position = "fixed";
        tempDiv.style.opacity = "0";
        tempDiv.style.pointerEvents = "none";
        tempDiv.style.zIndex = "-1000";
        tempDiv.innerHTML = svgContent;
        document.body.appendChild(tempDiv);
        el = tempDiv.querySelector(`[data-zone-id="${currentZone.id}"]`) as SVGElement;
      }

      if (el) {
        const { bbox, polygon } = getShapeGeometry(el);
        const svgEl = el.closest("svg");
        const vb = svgEl?.viewBox?.baseVal;
        const viewBox = vb && vb.width > 0 && vb.height > 0
          ? { x: vb.x, y: vb.y, width: vb.width, height: vb.height }
          : { x: 0, y: 0, width: 500, height: 500 };

        setZoneGeometry({
          bbox,
          polygon,
          viewBox,
        });
      }

      if (tempDiv && document.body.contains(tempDiv)) {
        document.body.removeChild(tempDiv);
      }
    } catch (err) {
      console.warn("Could not calculate precise zone geometry:", err);
    }
  }, [currentZone, svgContent]);

  // Curve Animation loop
  useEffect(() => {
    if (isPlayingCurve && frameCount > 1) {
      playTimerRef.current = setInterval(() => {
        setActiveFrameIndex((prev) => (prev + 1) % frameCount);
      }, 1000 / playbackFps);
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlayingCurve, frameCount, playbackFps]);

  // Update current frame's artwork
  const updateCurrentFrame = (updater: (prevFrame: FrameArtwork) => FrameArtwork) => {
    if (!currentZone) return;

    const newFrames = [...currentZoneArtwork.frames];
    newFrames[activeFrameIndex] = updater(currentFrame);

    const updatedZoneArtwork: ZoneArtwork = {
      ...currentZoneArtwork,
      frames: newFrames,
      activeFrameIndex,
    };

    onUpdateZoneArtwork(currentZone.id, updatedZoneArtwork);
  };

  // Image Transform manipulation handlers
  const handleUpdateImageTransform = (transform: ImageTransform, applyToAll: boolean = syncTransformToAll) => {
    if (!currentZone) return;

    if (applyToAll) {
      const newFrames = currentZoneArtwork.frames.map((frame) => ({
        ...frame,
        imageTransform: { ...transform },
      }));
      onUpdateZoneArtwork(currentZone.id, {
        ...currentZoneArtwork,
        frames: newFrames,
      });
    } else {
      updateCurrentFrame((prev) => ({
        ...prev,
        imageTransform: { ...transform },
      }));
    }
  };

  const handleScaleRight = (deltaPercent: number) => {
    const currentT = currentFrame.imageTransform || { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0 };
    const curScaleX = currentT.scaleX !== undefined ? currentT.scaleX : 1.0;
    const nextScaleX = Math.max(0.1, Math.min(5.0, Math.round((curScaleX + deltaPercent) * 100) / 100));

    // To scale to the right only with left edge anchored:
    const baseW = zoneGeometry.bbox.width * (currentT.scale || 1);
    const deltaW = (nextScaleX - curScaleX) * baseW;
    const rad = ((currentT.rotation || 0) * Math.PI) / 180;
    const shiftX = (deltaW / 2) * Math.cos(rad);
    const shiftY = (deltaW / 2) * Math.sin(rad);

    handleUpdateImageTransform(
      {
        ...currentT,
        scaleX: nextScaleX,
        x: Math.round((currentT.x || 0) + shiftX),
        y: Math.round((currentT.y || 0) + shiftY),
      },
      syncTransformToAll
    );
    showStatus?.(`Scaled to right: ${Math.round(nextScaleX * 100)}% (Left Edge Fixed)`, "info");
  };

  const handleFitImageToCurve = () => {
    handleUpdateImageTransform(
      {
        x: 0,
        y: 0,
        scale: 1.0,
        scaleX: 1.0,
        scaleY: 1.0,
        rotation: 0,
      },
      syncTransformToAll
    );
    showStatus?.("Image fitted to curve bounds.", "info");
  };

  const handleFillImageToCurve = () => {
    handleUpdateImageTransform(
      {
        x: 0,
        y: 0,
        scale: 1.4,
        scaleX: 1.0,
        scaleY: 1.0,
        rotation: 0,
      },
      syncTransformToAll
    );
    showStatus?.("Image scaled to fill curve area.", "info");
  };

  const handleResetImageTransform = () => {
    handleUpdateImageTransform(
      {
        x: 0,
        y: 0,
        scale: 1.0,
        scaleX: 1.0,
        scaleY: 1.0,
        rotation: 0,
      },
      syncTransformToAll
    );
    showStatus?.("Reset image position, width & scale to default.", "info");
  };

  const handleRemoveFrameImage = (fromAll: boolean = false) => {
    if (!currentZone) return;
    if (fromAll) {
      const newFrames = currentZoneArtwork.frames.map((frame) => ({
        ...frame,
        imageDataUrl: undefined,
      }));
      onUpdateZoneArtwork(currentZone.id, {
        ...currentZoneArtwork,
        frames: newFrames,
      });
      showStatus?.(`Removed image from all ${frameCount} frames.`, "info");
    } else {
      updateCurrentFrame((prev) => ({
        ...prev,
        imageDataUrl: undefined,
      }));
      showStatus?.(`Removed image from Frame #${activeFrameIndex + 1}.`, "info");
    }
  };

  // Zoom & Pan helper handlers
  const handleZoomStep = (delta: number) => {
    setZoomLevel((prev) => {
      const next = Math.round((prev + delta) * 100) / 100;
      return Math.min(Math.max(next, 0.5), 16.0);
    });
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();

    // If currently in Move/Transform mode and image is active on frame, wheel scales image
    if (currentTool === "transform" && currentFrame.imageDataUrl) {
      const currentT = currentFrame.imageTransform || { x: 0, y: 0, scale: 1, rotation: 0 };
      const scaleFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const newScale = Math.min(Math.max(Math.round((currentT.scale || 1) * scaleFactor * 100) / 100, 0.05), 4.0);
      handleUpdateImageTransform(
        {
          ...currentT,
          scale: newScale,
        },
        syncTransformToAll
      );
      return;
    }

    const canvas = drawCanvasRef.current;
    const stageEl = stageContainerRef.current;
    if (!stageEl || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    // SVG coordinates of the mouse cursor before zoom
    const svgCursorX = activeViewBox.x + (cursorX / rect.width) * activeViewBox.width;
    const svgCursorY = activeViewBox.y + (cursorY / rect.height) * activeViewBox.height;

    const factor = e.deltaY < 0 ? 1.15 : 0.869;
    const newZoom = Math.min(Math.max(zoomLevel * factor, 0.5), 16.0);

    const newW = baseViewBox.width / newZoom;
    const newH = baseViewBox.height / newZoom;

    // Re-center around mouse cursor
    const newCx = svgCursorX + (0.5 - cursorX / rect.width) * newW;
    const newCy = svgCursorY + (0.5 - cursorY / rect.height) * newH;

    setZoomLevel(newZoom);
    setPanOffset({
      x: newCx - baseViewBox.cx,
      y: newCy - baseViewBox.cy,
    });
  };

  // Helper to re-render the main drawing canvas
  const redrawCanvas = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Scale canvas coordinates to activeViewBox (zoomed curve extents or full view)
    const scaleX = w / activeViewBox.width;
    const scaleY = h / activeViewBox.height;

    ctx.save();
    ctx.scale(scaleX, scaleY);
    ctx.translate(-activeViewBox.x, -activeViewBox.y);

    // 1. Onion Skinning (Previous frame in faint pink)
    if (onionSkinning && activeFrameIndex > 0 && !isPlayingCurve) {
      const prevFrame = currentZoneArtwork.frames[activeFrameIndex - 1];
      if (prevFrame && prevFrame.strokes.length > 0) {
        ctx.save();
        ctx.globalAlpha = onionOpacity;
        prevFrame.strokes.forEach((stroke) => {
          if (stroke.points.length === 0 || stroke.isEraser) return;
          drawSmoothStroke(ctx, {
            ...stroke,
            color: "#ff007f",
          });
        });
        ctx.restore();
      }
    }

    // 2. Contour clipping if enabled
    if (clipToContour && zoneGeometry.polygon.length >= 3) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(zoneGeometry.polygon[0].x, zoneGeometry.polygon[0].y);
      for (let i = 1; i < zoneGeometry.polygon.length; i++) {
        ctx.lineTo(zoneGeometry.polygon[i].x, zoneGeometry.polygon[i].y);
      }
      ctx.closePath();
      ctx.clip();
    }

    // 3. Draw image/GIF frame
    const finishRendering = () => {
      // 4. Draw current frame strokes with smooth midpoint quadratic bezier curves
      if (currentFrame.strokes && currentFrame.strokes.length > 0) {
        currentFrame.strokes.forEach((stroke) => {
          if (stroke.points.length === 0) return;
          drawSmoothStroke(ctx, stroke);
        });
      }

      if (clipToContour && zoneGeometry.polygon.length >= 3) {
        ctx.restore();
      }

      // 5. Draw Transform Bounding Guides if in Move/Transform mode
      if (currentTool === "transform" && currentFrame.imageDataUrl && zoneGeometry.bbox) {
        ctx.save();
        const transform = currentFrame.imageTransform || { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0 };
        const bbox = zoneGeometry.bbox;
        const cx = bbox.x + bbox.width / 2 + transform.x;
        const cy = bbox.y + bbox.height / 2 + transform.y;
        const sx = (transform.scale || 1) * (transform.scaleX !== undefined ? transform.scaleX : 1);
        const sy = (transform.scale || 1) * (transform.scaleY !== undefined ? transform.scaleY : 1);

        ctx.translate(cx, cy);
        ctx.rotate((transform.rotation * Math.PI) / 180);
        ctx.scale(sx, sy);

        const halfW = bbox.width / 2;
        const halfH = bbox.height / 2;

        ctx.strokeStyle = "#ffe600";
        ctx.lineWidth = Math.max(1.5, activeViewBox.width / 350);
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(-halfW, -halfH, bbox.width, bbox.height);

        // Corner handles
        ctx.fillStyle = "#ffe600";
        const dotSize = Math.max(4, activeViewBox.width / 120);
        [
          [-halfW, -halfH],
          [halfW, -halfH],
          [halfW, halfH],
          [-halfW, halfH],
        ].forEach(([dx, dy]) => {
          ctx.fillRect(dx - dotSize / 2, dy - dotSize / 2, dotSize, dotSize);
        });

        ctx.restore();
      }

      ctx.restore();
    };

    if (currentFrame.imageDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.save();
        const transform = currentFrame.imageTransform || { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0 };
        const bbox = zoneGeometry.bbox;
        const cx = bbox.x + bbox.width / 2 + transform.x;
        const cy = bbox.y + bbox.height / 2 + transform.y;
        const sx = (transform.scale || 1) * (transform.scaleX !== undefined ? transform.scaleX : 1);
        const sy = (transform.scale || 1) * (transform.scaleY !== undefined ? transform.scaleY : 1);

        ctx.translate(cx, cy);
        ctx.rotate((transform.rotation * Math.PI) / 180);
        ctx.scale(sx, sy);
        
        // Scale to fit bbox nicely by default
        const maxDim = Math.max(img.width, img.height);
        const fitScale = maxDim > 0 ? Math.min(bbox.width, bbox.height) / maxDim : 1;
        const drawW = img.width * fitScale;
        const drawH = img.height * fitScale;

        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
        finishRendering();
      };
      img.onerror = () => finishRendering();
      img.src = currentFrame.imageDataUrl;
    } else {
      finishRendering();
    }
  };

  // Re-draw canvas whenever active frame, strokes, or options change
  useEffect(() => {
    redrawCanvas();
  }, [
    activeFrameIndex, 
    currentFrame, 
    currentTool,
    onionSkinning, 
    onionOpacity, 
    clipToContour, 
    zoneGeometry, 
    currentZoneArtwork,
    activeViewBox,
  ]);

  // Pointer Drawing, Transforming & Panning Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // 1. Pan activation check (Pan Tool, Spacebar, or Middle/Right click)
    if (currentTool === "pan" || isSpacePressed || e.button === 1 || e.button === 2) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        startPanX: panOffset.x,
        startPanY: panOffset.y,
      };
      return;
    }

    // 2. Image Reposition / Transform Mode Check
    if (currentTool === "transform") {
      e.preventDefault();
      const currentT = currentFrame.imageTransform || { x: 0, y: 0, scale: 1, rotation: 0 };
      transformStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        startX: currentT.x || 0,
        startY: currentT.y || 0,
      };
      isTransformingRef.current = true;
      return;
    }

    if (isPlayingCurve) setIsPlayingCurve(false);

    e.preventDefault();
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    isDrawingRef.current = true;

    // High frequency sampling with coalesced hardware events & densification
    const sampled = extractSampledPoints(e, activeViewBox, rect);
    const initialPoints = densifyPoints(sampled, 2.0);

    // Push current state to undo stack
    setUndoStack((prev) => [...prev.slice(-25), currentFrame.strokes]);
    setRedoStack([]);

    const newStroke: DrawStroke = {
      id: `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      points: initialPoints,
      color: brushColor,
      width: brushSize,
      isEraser: currentTool === "eraser",
    };

    currentStrokeRef.current = newStroke;

    updateCurrentFrame((prev) => ({
      ...prev,
      strokes: [...prev.strokes, newStroke],
    }));

    // Live draw initial point stamp
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const scaleX = canvas.width / activeViewBox.width;
      const scaleY = canvas.height / activeViewBox.height;
      ctx.save();
      ctx.scale(scaleX, scaleY);
      ctx.translate(-activeViewBox.x, -activeViewBox.y);
      drawSmoothStroke(ctx, newStroke);
      ctx.restore();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // 1. Handle Panning
    if (isPanning && panStartRef.current) {
      e.preventDefault();
      const dx = e.clientX - panStartRef.current.clientX;
      const dy = e.clientY - panStartRef.current.clientY;

      const canvas = drawCanvasRef.current;
      const rect = canvas ? canvas.getBoundingClientRect() : { width: 500, height: 500 };
      const svgDx = (dx / rect.width) * activeViewBox.width;
      const svgDy = (dy / rect.height) * activeViewBox.height;

      setPanOffset({
        x: panStartRef.current.startPanX - svgDx,
        y: panStartRef.current.startPanY - svgDy,
      });
      return;
    }

    // 2. Handle Image Repositioning
    if (isTransformingRef.current && transformStartRef.current) {
      e.preventDefault();
      const dx = e.clientX - transformStartRef.current.clientX;
      const dy = e.clientY - transformStartRef.current.clientY;

      const canvas = drawCanvasRef.current;
      const rect = canvas ? canvas.getBoundingClientRect() : { width: 500, height: 500 };
      const svgDx = (dx / rect.width) * activeViewBox.width;
      const svgDy = (dy / rect.height) * activeViewBox.height;

      const currentT = currentFrame.imageTransform || { x: 0, y: 0, scale: 1, rotation: 0 };
      handleUpdateImageTransform(
        {
          ...currentT,
          x: Math.round(transformStartRef.current.startX + svgDx),
          y: Math.round(transformStartRef.current.startY + svgDy),
        },
        syncTransformToAll
      );
      return;
    }

    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    e.preventDefault();

    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    // High frequency sampling with coalesced hardware events & densification
    const sampled = extractSampledPoints(e, activeViewBox, rect);
    const densified = densifyPoints(sampled, 2.0);

    currentStrokeRef.current.points.push(...densified);

    // Live incremental stroke render with smooth quadratic bezier curves
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scaleX = canvas.width / activeViewBox.width;
    const scaleY = canvas.height / activeViewBox.height;

    ctx.save();
    ctx.scale(scaleX, scaleY);
    ctx.translate(-activeViewBox.x, -activeViewBox.y);
    drawSmoothStroke(ctx, currentStrokeRef.current);
    ctx.restore();
  };

  const handlePointerUp = () => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
    if (isTransformingRef.current) {
      isTransformingRef.current = false;
      transformStartRef.current = null;
    }
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      if (currentStrokeRef.current) {
        const completedStroke: DrawStroke = {
          ...currentStrokeRef.current,
          points: currentStrokeRef.current.points.map((p) => ({ x: p.x, y: p.y })),
        };
        updateCurrentFrame((prev) => {
          const allExceptLast = prev.strokes.slice(0, -1);
          return {
            ...prev,
            strokes: [...allExceptLast, completedStroke],
          };
        });
      }
      currentStrokeRef.current = null;
      redrawCanvas();
    }
  };

  // Canvas coordinate converter with exact normalized subpixel alignment (no drift)
  const getCanvasCoordinates = (
    e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>
  ): DrawPoint => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const rectW = Math.max(1, rect.width);
    const rectH = Math.max(1, rect.height);
    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rectW));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rectH));

    return {
      x: activeViewBox.x + normX * activeViewBox.width,
      y: activeViewBox.y + normY * activeViewBox.height,
    };
  };

  // Double click on canvas: if clicked outside contour polygon, exit to mapper!
  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoordinates(e);
    let inside = false;
    const poly = zoneGeometry.polygon;
    if (poly.length >= 3) {
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x,
          yi = poly[i].y;
        const xj = poly[j].x,
          yj = poly[j].y;
        const intersect =
          yi > pt.y !== yj > pt.y &&
          pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
      }
    }
    if (!inside) {
      onBackToMapper();
    }
  };

  // Undo & Redo Actions
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const lastStrokes = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, currentFrame.strokes]);
    setUndoStack((prev) => prev.slice(0, -1));

    updateCurrentFrame((prev) => ({
      ...prev,
      strokes: lastStrokes,
    }));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextStrokes = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, currentFrame.strokes]);
    setRedoStack((prev) => prev.slice(0, -1));

    updateCurrentFrame((prev) => ({
      ...prev,
      strokes: nextStrokes,
    }));
  };

  // Keyboard shortcut listener for Ctrl+Z (Undo) and Ctrl+Y / Ctrl+Shift+Z (Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;
      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoStack, redoStack, currentFrame]);

  // Clear Frame Artwork (instant without blocking confirm in iframe)
  const handleClearFrame = (frameIdx: number = activeFrameIndex) => {
    if (!currentZone) return;
    const target = currentZoneArtwork.frames[frameIdx];
    if (target) {
      setUndoStack((prev) => [...prev.slice(-25), target.strokes]);
      setRedoStack([]);
    }

    const newFrames = [...currentZoneArtwork.frames];
    newFrames[frameIdx] = {
      frameIndex: frameIdx,
      strokes: [],
      imageDataUrl: undefined,
      imageTransform: { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0 },
    };

    onUpdateZoneArtwork(currentZone.id, {
      ...currentZoneArtwork,
      frames: newFrames,
    });

    showStatus?.(`Frame #${frameIdx + 1} artwork cleared.`);
  };

  // Clear ALL Frames across this curve (removes all drawings, GIFs, and layers)
  const handleClearAllFrames = () => {
    if (!currentZone) return;
    const currentStrokes = currentFrame?.strokes || [];
    setUndoStack((prev) => [...prev.slice(-25), currentStrokes]);
    setRedoStack([]);

    const newFrames = Array.from({ length: frameCount }, (_, i) => ({
      frameIndex: i,
      strokes: [],
      imageDataUrl: undefined,
      imageTransform: { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0 },
    }));

    onUpdateZoneArtwork(currentZone.id, {
      ...currentZoneArtwork,
      frames: newFrames,
    });

    showStatus?.(`Cleared ALL ${frameCount} frames, GIFs, and drawings from ${currentZone.defaultName || "Curve"}.`, "info");
  };

  // Deep clone strokes with clean independent coordinates & IDs
  const cloneStrokes = (strokes: DrawStroke[], targetIdx: number): DrawStroke[] => {
    return (strokes || []).map((s, sIdx) => ({
      id: `stroke-f${targetIdx}-${Date.now()}-${sIdx}-${Math.random().toString(36).substring(2, 6)}`,
      points: s.points.map((p) => ({ x: p.x, y: p.y })),
      color: s.color,
      width: s.width,
      isEraser: s.isEraser,
    }));
  };

  // Apply custom copy options from modal or quick actions
  const handleApplyCustomCopy = (options: {
    sourceIndex: number;
    targetIndices: number[];
    includeStrokes: boolean;
    includeImage: boolean;
    mode: "replace" | "merge";
  }) => {
    if (!currentZone) return;

    const sourceFrame = currentZoneArtwork.frames[options.sourceIndex];
    if (!sourceFrame) return;

    const newFrames = [...currentZoneArtwork.frames];

    options.targetIndices.forEach((targetIdx) => {
      const existing = newFrames[targetIdx] || { frameIndex: targetIdx, strokes: [] };
      let finalStrokes = [...(existing.strokes || [])];

      if (options.includeStrokes) {
        const cloned = cloneStrokes(sourceFrame.strokes, targetIdx);
        if (options.mode === "replace") {
          finalStrokes = cloned;
        } else {
          finalStrokes = [...finalStrokes, ...cloned];
        }
      }

      let finalImageDataUrl = existing.imageDataUrl;
      let finalImageTransform = existing.imageTransform ? { ...existing.imageTransform } : undefined;

      if (options.includeImage) {
        finalImageDataUrl = sourceFrame.imageDataUrl;
        finalImageTransform = sourceFrame.imageTransform
          ? { ...sourceFrame.imageTransform }
          : undefined;
      }

      newFrames[targetIdx] = {
        ...existing,
        frameIndex: targetIdx,
        strokes: finalStrokes,
        imageDataUrl: finalImageDataUrl,
        imageTransform: finalImageTransform,
      };
    });

    onUpdateZoneArtwork(currentZone.id, {
      ...currentZoneArtwork,
      frames: newFrames,
    });

    showStatus?.(
      `Copied Frame #${options.sourceIndex + 1} artwork onto ${options.targetIndices.length} frames in this sequence!`,
      "success"
    );
  };

  // Instant 1-Click: Copy active frame artwork to all other frames in sequence
  const handleQuickCopyAll = (sourceIdx = activeFrameIndex) => {
    if (!currentZone) return;
    const sourceFrame = currentZoneArtwork.frames[sourceIdx];
    const strokeCount = sourceFrame?.strokes?.length || 0;
    const hasImage = !!sourceFrame?.imageDataUrl;

    if (strokeCount === 0 && !hasImage) {
      showStatus?.(`Frame #${sourceIdx + 1} is currently blank. Draw strokes or load an image first!`, "error");
      return;
    }

    const allTargetIndices = Array.from({ length: frameCount }, (_, i) => i).filter((i) => i !== sourceIdx);
    if (allTargetIndices.length === 0) return;

    handleApplyCustomCopy({
      sourceIndex: sourceIdx,
      targetIndices: allTargetIndices,
      includeStrokes: strokeCount > 0,
      includeImage: hasImage,
      mode: "replace",
    });
  };

  // Open copy dialog modal for custom target frame selection
  const handleOpenCopyModal = (sourceIdx = activeFrameIndex) => {
    setCopyModalSourceIndex(sourceIdx);
    setIsCopyModalOpen(true);
  };

  // Duplicate to Next Frame
  const handleDuplicateToNext = () => {
    if (!currentZone) return;
    const nextIdx = (activeFrameIndex + 1) % frameCount;
    const newFrames = [...currentZoneArtwork.frames];
    newFrames[nextIdx] = {
      frameIndex: nextIdx,
      strokes: cloneStrokes(currentFrame.strokes, nextIdx),
      imageDataUrl: currentFrame.imageDataUrl,
      imageTransform: currentFrame.imageTransform ? { ...currentFrame.imageTransform } : undefined,
    };

    onUpdateZoneArtwork(currentZone.id, {
      ...currentZoneArtwork,
      frames: newFrames,
    });
    setActiveFrameIndex(nextIdx);
    showStatus?.(`Duplicated Frame #${activeFrameIndex + 1} to Frame #${nextIdx + 1}!`, "success");
  };

  // Handle Image Upload for Current Frame
  const handleImageFile = (file: File) => {
    if (file.name.toLowerCase().endsWith(".gif")) {
      setIsGifTrimmerOpen(true);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      updateCurrentFrame((prev) => ({
        ...prev,
        imageDataUrl: dataUrl,
        imageTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      }));
      showStatus(`Image loaded to Frame #${activeFrameIndex + 1}!`);
    };
    reader.readAsDataURL(file);
  };

  // Handle Apply Trimmed GIF Frames
  const handleApplyGifFrames = (frameDataUrls: string[]) => {
    if (!currentZone) return;

    const newFrames: FrameArtwork[] = [];
    for (let i = 0; i < frameCount; i++) {
      const existingStrokes = currentZoneArtwork.frames[i]?.strokes || [];
      newFrames.push({
        frameIndex: i,
        strokes: existingStrokes,
        imageDataUrl: frameDataUrls[i] || frameDataUrls[0],
        imageTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      });
    }

    onUpdateZoneArtwork(currentZone.id, {
      ...currentZoneArtwork,
      frames: newFrames,
    });

    setActiveFrameIndex(0);
    setIsPlayingCurve(true);
    showStatus(`Applied ${frameDataUrls.length} trimmed GIF frames to ${currentSettings?.zoneName || "Curve"}!`);
  };

  // Quick Colors Palette
  const cyberColors = [
    { name: "Cyan", hex: "#00f0ff" },
    { name: "Pink", hex: "#ff007f" },
    { name: "Red", hex: "#ff0000" },
    { name: "Yellow", hex: "#ffe600" },
    { name: "Green", hex: "#00ff66" },
    { name: "Purple", hex: "#b026ff" },
    { name: "White", hex: "#ffffff" },
    { name: "Charcoal", hex: "#1e293b" },
  ];

  return (
    <div className="flex flex-col h-screen bg-black text-stone-300 font-mono select-none overflow-hidden bg-scanlines bg-grid-cyber">
      {/* 1. Header Toolbar */}
      <header className="h-14 border-b border-[#262626] bg-black/95 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-30 gap-2">
        {/* Left: Back to Vector Mapper Button, Undo/Redo & Stage Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToMapper}
            className="p-1.5 px-3 rounded-none bg-[#121212] hover:bg-[#1f1f1f] border border-[#00f0ff]/40 hover:border-[#00f0ff] text-[#00f0ff] transition-all text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-95 shadow-md font-mono"
            title="Return to multi-vector export and slice preview page"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-bold tracking-wider">BACK TO VECTOR MAPPER</span>
          </button>

          {/* Top Header Undo & Redo Quick Group */}
          <div className="flex items-center gap-1 bg-[#111] p-1 border border-[#262626]">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="p-1 px-2.5 bg-[#181818] hover:bg-[#252525] disabled:opacity-30 text-stone-200 hover:text-white border border-[#333] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold font-mono"
              title="Undo last stroke or change (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5 text-[#00f0ff]" />
              <span>UNDO</span>
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-1 px-2.5 bg-[#181818] hover:bg-[#252525] disabled:opacity-30 text-stone-200 hover:text-white border border-[#333] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold font-mono"
              title="Redo last change (Ctrl+Y / Ctrl+Shift+Z)"
            >
              <Redo2 className="w-3.5 h-3.5 text-[#00f0ff]" />
              <span>REDO</span>
            </button>
          </div>

          <div className="h-5 w-[1px] bg-[#262626] hidden sm:block" />

          <div className="hidden md:flex items-center gap-2 font-mono">
            <CruciformIcon className="w-4 h-4 text-[#00f0ff]" glow />
            <span className="text-xs font-bold tracking-widest text-white uppercase">
              FRAME ARTWORK STUDIO
            </span>
          </div>
        </div>

        {/* Center: Dynamic Instructional Banner - DOUBLE CLICK OUTSIDE A CURVE TO EXIT */}
        <div className="flex items-center gap-2">
          <button
            onClick={onBackToMapper}
            className="flex items-center gap-2 px-3 py-1 bg-[#ff007f]/15 hover:bg-[#ff007f]/25 border border-[#ff007f]/50 hover:border-[#ff007f] text-[#ff007f] font-mono text-[10.5px] font-bold tracking-wider cursor-pointer transition-all active:scale-95 shadow-[0_0_12px_rgba(255,0,127,0.25)] rounded-none"
            title="Click or double-click outside curve to exit back to Vector Mapper"
          >
            <span className="w-2 h-2 rounded-full bg-[#ff007f] animate-ping" />
            <span>DOUBLE CLICK OUTSIDE A CURVE TO EXIT</span>
          </button>

          {currentZone && currentSettings && (
            <div className="hidden xl:flex items-center gap-2 bg-[#0d0d0d] px-2.5 py-1 border border-[#262626] font-mono">
              <span className="text-[10px] font-bold text-stone-400 uppercase">PATH:</span>
              <select
                value={currentZone.id}
                onChange={(e) => onSelectZone(e.target.value)}
                className="bg-transparent text-[#00f0ff] font-bold text-xs focus:outline-none cursor-pointer uppercase tracking-wider"
              >
                {activeZones.map((z) => (
                  <option key={z.id} value={z.id} className="bg-[#111] text-white">
                    {zoneSettings[z.id]?.zoneName || z.defaultName} ({zoneSettings[z.id]?.frameCount || 6}F)
                  </option>
                ))}
              </select>

              <div className="h-3 w-[1px] bg-[#333]" />

              <span className="text-[10px] font-bold text-[#ff007f] bg-[#ff007f]/10 px-1 py-0.5 border border-[#ff007f]/30">
                {currentSettings.frameCount} FRAMES
              </span>
            </div>
          )}
        </div>

        {/* Right: SEE ALL PREVIEW Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSeeAllPreview}
            className="p-1.5 px-4 rounded-none bg-gradient-to-r from-[#00f0ff] to-[#00c8d6] hover:from-[#00c8d6] hover:to-[#00f0ff] text-black font-black flex items-center gap-2 text-xs font-mono transition-all cursor-pointer active:scale-95 shadow-[0_0_15px_rgba(0,240,255,0.3)] animate-pulse"
            title="Preview all curves and frames sliced together with interactive slit mask simulation"
          >
            <Eye className="w-4 h-4 text-black" />
            <span className="tracking-wider">SEE ALL PREVIEW</span>
          </button>
        </div>
      </header>

      {/* 2. Main Studio Body */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 relative">
        {/* Left Column: Curve Layer Navigator & Frame Actions */}
        <div className="w-full md:w-64 bg-[#090909] border-r border-[#262626] flex flex-col shrink-0 overflow-y-auto">
          <div className="p-3 border-b border-[#262626] bg-black/60 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-widest text-[#00f0ff] uppercase flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              CURVES / PATHS ({activeZones.length})
            </span>
            <span className="text-[9px] text-stone-500 font-mono">1 AT A TIME</span>
          </div>

          {/* Zones list */}
          <div className="flex flex-col p-2 gap-1.5">
            {activeZones.map((z) => {
              const settings = zoneSettings[z.id];
              const isSelected = z.id === currentZone?.id;
              const artwork = zoneArtworks[z.id];
              const hasArtwork = artwork && artwork.frames.some((f) => f.strokes.length > 0 || f.imageDataUrl);

              return (
                <div
                  key={z.id}
                  onClick={() => {
                    onSelectZone(z.id);
                    setActiveFrameIndex(0);
                  }}
                  className={`p-2.5 text-left border flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[#ff007f]/15 border-[#ff007f]/60 text-[#ff007f] shadow-[0_0_12px_rgba(255,0,127,0.25)]"
                      : "bg-[#111] border-[#222] text-stone-400 hover:text-stone-200 hover:border-[#333]"
                  }`}
                >
                  <div className="flex flex-col truncate">
                    <span 
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        const current = settings?.zoneName || z.defaultName;
                        const newName = prompt("Rename Curve:", current);
                        if (newName && newName.trim() && onRenameZone) {
                          onRenameZone(z.id, newName.trim());
                        }
                      }}
                      title="Double-click to rename curve"
                      className={`text-xs font-bold truncate ${isSelected ? "text-[#ff007f] font-black" : "text-[#ff007f]/90 hover:text-[#ff007f]"}`}
                    >
                      {settings?.zoneName || z.defaultName}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <span 
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          const current = settings?.frameCount || 6;
                          const newCount = prompt("Change Frame Count (0 = Solid, 2-24):", String(current));
                          if (newCount && onChangeZoneFrames) {
                            const parsed = parseInt(newCount, 10);
                            if (!isNaN(parsed) && parsed >= 0) {
                              onChangeZoneFrames(z.id, parsed);
                            }
                          }
                        }}
                        title="Double-click to edit frame count"
                        className="text-[9px] text-[#ff007f]/70 hover:text-[#00f0ff] font-mono cursor-pointer"
                      >
                        {settings?.frameCount || 6} Frames
                      </span>
                      <span className="text-[9px] text-stone-500 font-mono">
                        Angle: {settings?.revealDirection.angle || 0}°
                      </span>
                    </div>
                  </div>

                  {hasArtwork && (
                    <span className="p-1 px-1.5 bg-[#ff007f]/20 border border-[#ff007f]/50 text-[#ff007f] text-[9px] font-bold rounded">
                      ART
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Curve Quick Actions & Import Buttons */}
          <div className="mt-auto p-3 border-t border-[#262626] bg-black/40 flex flex-col gap-2">
            <span className="text-[10px] font-bold text-stone-400 uppercase">
              ARTWORK SOURCES
            </span>

            {/* Giphy Online Search & Slicer */}
            <button
              onClick={() => setIsGiphyModalOpen(true)}
              className="p-2 bg-gradient-to-r from-[#ff007f]/20 to-[#9900ff]/20 hover:from-[#ff007f]/30 hover:to-[#9900ff]/30 border border-[#ff007f]/60 hover:border-[#ff007f] text-[#ff007f] text-[11px] font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_0_10px_rgba(255,0,127,0.2)]"
              title="Search online GIFs on GIPHY and auto-resample/slice to this curve's frame count"
            >
              <Sparkles className="w-4 h-4 text-[#ff007f]" />
              <span>SEARCH GIPHY & SLICE</span>
            </button>

            {/* Upload Local GIF & Trim button */}
            <button
              onClick={() => setIsGifTrimmerOpen(true)}
              className="p-2 bg-[#141414] hover:bg-[#1f1f1f] border border-[#333] hover:border-[#ff007f]/50 text-stone-300 hover:text-[#ff007f] text-[11px] font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Film className="w-4 h-4 text-[#ff007f]" />
              <span>UPLOAD LOCAL GIF</span>
            </button>

            {/* Upload Image to Frame */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleImageFile(e.target.files[0]);
                }
              }}
              className="hidden"
            />
            <button
              onClick={() => imageInputRef.current?.click()}
              className="p-2 bg-[#141414] hover:bg-[#1f1f1f] border border-[#333] hover:border-[#00f0ff]/40 text-stone-300 text-[11px] font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <ImageIcon className="w-4 h-4 text-[#00f0ff]" />
              <span>ADD IMAGE / SVG TO FRAME</span>
            </button>
          </div>
        </div>

        {/* Center: Canvas Workspace */}
        <div className="flex-1 flex flex-col bg-[#05080f] relative overflow-hidden min-w-0">
          {/* Top Canvas Viewport & Navigation Bar (Single line, spacious, clean, no overlap) */}
          <div className="h-11 bg-black/95 border-b border-[#262626] px-4 flex items-center justify-between shrink-0 z-20 gap-3">
            {/* Left: Undo/Redo & Zoom/View controls */}
            <div className="flex items-center gap-2">
              {/* Quick Undo, Redo & Clear buttons directly above canvas */}
              <div className="flex items-center gap-1 bg-[#111] p-1 border border-[#262626]">
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="p-1 px-2 bg-[#181818] hover:bg-[#252525] disabled:opacity-30 text-stone-200 hover:text-white border border-[#333] transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold font-mono"
                  title="Undo last stroke or change (Ctrl+Z)"
                >
                  <Undo2 className="w-3.5 h-3.5 text-[#00f0ff]" />
                  <span>UNDO</span>
                </button>
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="p-1 px-2 bg-[#181818] hover:bg-[#252525] disabled:opacity-30 text-stone-200 hover:text-white border border-[#333] transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold font-mono"
                  title="Redo change (Ctrl+Y / Ctrl+Shift+Z)"
                >
                  <Redo2 className="w-3.5 h-3.5 text-[#00f0ff]" />
                  <span>REDO</span>
                </button>
                <button
                  onClick={() => handleClearFrame(activeFrameIndex)}
                  className="p-1 px-2 bg-[#181818] hover:bg-red-950/40 text-stone-300 hover:text-red-400 border border-[#333] hover:border-red-500 transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold font-mono"
                  title={`Clear all artwork in Frame #${activeFrameIndex + 1}`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  <span>CLEAR</span>
                </button>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-[#111] p-1 border border-[#262626]">
                <button
                  onClick={() => handleZoomStep(-0.25)}
                  className="p-1 px-1.5 bg-[#181818] hover:bg-[#252525] text-stone-300 hover:text-white border border-[#333] transition-all cursor-pointer"
                  title="Zoom Out (Scroll wheel down)"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>

                <select
                  value={Math.round(zoomLevel * 100)}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setZoomLevel(val / 100);
                  }}
                  className="bg-black text-[#00f0ff] font-mono text-[11px] font-bold px-1.5 py-0.5 border border-[#333] cursor-pointer focus:outline-none"
                  title="Select Zoom Magnification"
                >
                  <option value={50}>50%</option>
                  <option value={75}>75%</option>
                  <option value={100}>100% (Fit)</option>
                  <option value={150}>150%</option>
                  <option value={200}>200% (2x)</option>
                  <option value={300}>300% (3x)</option>
                  <option value={400}>400% (4x)</option>
                  <option value={600}>600% (6x)</option>
                  <option value={800}>800% (8x)</option>
                  <option value={1200}>1200% (12x)</option>
                  <option value={1600}>1600% (16x)</option>
                </select>

                <button
                  onClick={() => handleZoomStep(0.25)}
                  className="p-1 px-1.5 bg-[#181818] hover:bg-[#252525] text-stone-300 hover:text-white border border-[#333] transition-all cursor-pointer"
                  title="Zoom In (Scroll wheel up)"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                {(zoomLevel !== 1.0 || panOffset.x !== 0 || panOffset.y !== 0) && (
                  <button
                    onClick={() => {
                      setZoomLevel(1.0);
                      setPanOffset({ x: 0, y: 0 });
                    }}
                    className="p-1 px-1.5 bg-[#ff007f]/20 hover:bg-[#ff007f]/30 text-[#ff007f] border border-[#ff007f]/50 text-[10px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1"
                    title="Reset Zoom & Pan to Fit Extents"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>RESET</span>
                  </button>
                )}
              </div>

              {/* Zoom to Curve Extents Toggle */}
              <button
                onClick={() => {
                  setZoomToCurve(!zoomToCurve);
                  setZoomLevel(1.0);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className={`p-1 px-2.5 text-[10px] font-mono font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  zoomToCurve
                    ? "bg-[#00f0ff]/20 border-[#00f0ff] text-[#00f0ff]"
                    : "bg-[#111] border-[#262626] text-stone-400 hover:text-stone-200"
                }`}
                title={zoomToCurve ? "Currently focused on curve extents. Click for full view" : "Click to zoom to curve extents"}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>{zoomToCurve ? "CURVE EXTENTS (FOCUSED)" : "FULL VIEW"}</span>
              </button>
            </div>

            {/* Right: Clean Shortcut Hints (Spacious, no overlap) */}
            <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono text-stone-400">
              <span>Hold <kbd className="bg-[#222] px-1 py-0.5 text-stone-200 border border-[#444] rounded text-[9px]">Space</kbd> + Drag to Pan</span>
              <span className="text-stone-600">•</span>
              <span>Scroll wheel to Zoom</span>
              {zoomLevel !== 1.0 && (
                <span className="text-[#00f0ff] font-bold bg-[#00f0ff]/10 px-2 py-0.5 border border-[#00f0ff]/30 ml-1">
                  {Math.round(zoomLevel * 100)}%
                </span>
              )}
            </div>
          </div>

          {/* Motion Cue Ticker (AI Choreography Blueprint Cue - Clean & non-overlapping) */}
          {motionAnalysis && (
            <div className="h-8 bg-[#0b0e14] border-b border-[#00f0ff]/20 px-4 flex items-center justify-between text-[10px] font-mono text-stone-300 shrink-0">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="px-1.5 py-0.5 bg-[#00f0ff]/20 text-[#00f0ff] font-bold uppercase text-[9px] border border-[#00f0ff]/30 shrink-0">
                  F#{activeFrameIndex + 1} CUE ({motionAnalysis.primaryRecommendation.name})
                </span>
                <span className="truncate text-stone-300 font-sans italic text-[11px]">
                  {motionAnalysis.primaryRecommendation.frameChoreography[activeFrameIndex % motionAnalysis.primaryRecommendation.frameChoreography.length]?.motionCue || motionAnalysis.primaryRecommendation.frameChoreography[0]?.motionCue}
                </span>
              </div>
              <button
                onClick={() => setIsMotionModalOpen(true)}
                className="text-[9px] text-[#00f0ff] hover:text-sky-300 hover:underline font-bold uppercase shrink-0 cursor-pointer pl-2 flex items-center gap-1"
              >
                <span>CHOREOGRAPHY GUIDE →</span>
              </button>
            </div>
          )}

          {/* Canvas Stage Surface */}
          <div 
            ref={stageContainerRef}
            onWheel={handleWheel}
            onDoubleClick={(e) => {
              const target = e.target as HTMLElement;
              if (target === stageContainerRef.current || !target.closest("canvas")) {
                onBackToMapper();
              }
            }}
            className="flex-1 flex items-center justify-center p-4 relative overflow-hidden"
          >
            <div className="relative w-full h-full max-w-[620px] max-h-[620px] aspect-square bg-[#080808] border border-[#262626] shadow-2xl flex items-center justify-center">
              {/* Background Reference Vector SVG */}
              {svgContent && (
                <svg
                  viewBox={`${activeViewBox.x} ${activeViewBox.y} ${activeViewBox.width} ${activeViewBox.height}`}
                  className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
                  dangerouslySetInnerHTML={{
                    __html: svgContent.replace(/<svg[^>]*>/i, "").replace(/<\/svg>/i, "")
                  }}
                />
              )}

              {/* Selected Curve Contour Overlay Highlight */}
              {showContourOutline && zoneGeometry.polygon.length >= 3 && (
                <svg
                  viewBox={`${activeViewBox.x} ${activeViewBox.y} ${activeViewBox.width} ${activeViewBox.height}`}
                  className="absolute inset-0 w-full h-full pointer-events-none z-10"
                >
                  <polygon
                    points={zoneGeometry.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="rgba(0, 240, 255, 0.04)"
                    stroke="#00f0ff"
                    strokeWidth={Math.max(1, activeViewBox.width / 280)}
                    strokeDasharray="4 3"
                    className="animate-pulse"
                  />
                </svg>
              )}

              {/* Main Interactive Drawing Canvas (High-Res 1600x1600) */}
              <canvas
                ref={drawCanvasRef}
                width={1600}
                height={1600}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onDoubleClick={handleCanvasDoubleClick}
                className={`w-full h-full block relative z-20 touch-none ${
                  isPanning || currentTool === "pan" || isSpacePressed
                    ? isPanning
                      ? "cursor-grabbing"
                      : "cursor-grab"
                    : currentTool === "transform"
                    ? isTransformingRef.current
                      ? "cursor-grabbing"
                      : "cursor-move"
                    : currentTool === "eraser"
                    ? "cursor-crosshair"
                    : "cursor-crosshair"
                }`}
              />

              {/* Interactive On-Canvas 2D Transform Gumball Gizmo Overlay */}
              {currentFrame.imageDataUrl && currentTool === "transform" && (
                <svg
                  viewBox={`${activeViewBox.x} ${activeViewBox.y} ${activeViewBox.width} ${activeViewBox.height}`}
                  className="absolute inset-0 w-full h-full z-30 pointer-events-auto overflow-visible"
                >
                  <TransformGumball
                    transform={currentFrame.imageTransform || { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0 }}
                    bbox={zoneGeometry.bbox}
                    viewBox={activeViewBox}
                    stageRect={drawCanvasRef.current?.getBoundingClientRect() || null}
                    onUpdateTransform={(t) => handleUpdateImageTransform(t, syncTransformToAll)}
                    onFit={handleFitImageToCurve}
                    onFill={handleFillImageToCurve}
                    onReset={handleResetImageTransform}
                    onRemove={() => handleRemoveFrameImage(syncTransformToAll)}
                    syncToAll={syncTransformToAll}
                    onToggleSyncToAll={() => setSyncTransformToAll(!syncTransformToAll)}
                    onScaleRightDelta={handleScaleRight}
                  />
                </svg>
              )}

              {/* Frame watermark / badge & Quick Gumball Selector */}
              <div className="absolute top-2 left-2 z-30 bg-black/85 border border-[#333] px-2 py-1 flex items-center gap-2 shadow-lg">
                <span className="text-[10px] font-mono font-bold text-[#00f0ff]">
                  FRAME #{activeFrameIndex + 1} OF {frameCount}
                </span>
                {currentFrame.imageDataUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentTool("transform");
                      showStatus?.("Gumball Gizmo activated for on-screen transform", "info");
                    }}
                    className="text-[9px] text-[#ffe600] font-mono hover:underline font-bold cursor-pointer flex items-center gap-1 bg-[#ffe600]/10 px-1.5 py-0.5 border border-[#ffe600]/40"
                    title="Click to select GIF and show Gumball Gizmo"
                  >
                    <Move className="w-2.5 h-2.5" />
                    <span>SELECT GIF (GUMBALL)</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Timeline / Filmstrip Bar */}
          <div className="h-32 bg-[#0a0a0a] border-t border-[#262626] p-3 flex flex-col justify-between shrink-0 z-30">
            {/* Timeline Controls Header */}
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-3">
                {/* Play / Pause loop */}
                <button
                  onClick={() => setIsPlayingCurve(!isPlayingCurve)}
                  className={`p-1.5 px-3 rounded border font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    isPlayingCurve
                      ? "bg-[#ff007f] text-white border-[#ff007f]"
                      : "bg-[#00f0ff] text-black border-[#00f0ff]"
                  }`}
                >
                  {isPlayingCurve ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlayingCurve ? "PAUSE LOOP" : "PLAY SEQUENCE"}</span>
                </button>

                {/* Step navigation */}
                <button
                  onClick={() => setActiveFrameIndex((prev) => (prev > 0 ? prev - 1 : frameCount - 1))}
                  className="p-1.5 bg-[#141414] hover:bg-[#222] border border-[#262626] text-stone-300 cursor-pointer"
                  title="Previous Frame"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-stone-300 font-bold">
                  {activeFrameIndex + 1} / {frameCount}
                </span>
                <button
                  onClick={() => setActiveFrameIndex((prev) => (prev < frameCount - 1 ? prev + 1 : 0))}
                  className="p-1.5 bg-[#141414] hover:bg-[#222] border border-[#262626] text-stone-300 cursor-pointer"
                  title="Next Frame"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {/* Playback FPS */}
                <div className="flex items-center gap-1.5 ml-2">
                  <span className="text-[10px] text-stone-500">SPEED:</span>
                  {[3, 6, 12].map((fps) => (
                    <button
                      key={fps}
                      onClick={() => setPlaybackFps(fps)}
                      className={`px-1.5 py-0.5 text-[9px] font-mono border cursor-pointer ${
                        playbackFps === fps
                          ? "bg-[#00f0ff]/20 border-[#00f0ff] text-[#00f0ff]"
                          : "bg-[#111] border-[#333] text-stone-400"
                      }`}
                    >
                      {fps} FPS
                    </button>
                  ))}
                </div>
              </div>

              {/* Duplicate / Copy Action buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleQuickCopyAll(activeFrameIndex)}
                  className="p-1 px-2.5 bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 border border-[#00f0ff]/40 hover:border-[#00f0ff] text-[#00f0ff] text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                  title="Copy current frame's drawing strokes and artwork across ALL other frames in this sequence"
                >
                  <CopyCheck className="w-3 h-3" />
                  <span>COPY TO ALL</span>
                </button>

                <button
                  onClick={() => handleOpenCopyModal(activeFrameIndex)}
                  className="p-1 px-2 bg-[#141414] hover:bg-[#222] border border-[#262626] hover:border-[#00f0ff]/40 text-stone-300 hover:text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                  title="Open Frame Copy modal to choose target frames and merge/replace options"
                >
                  <Copy className="w-3 h-3 text-[#00f0ff]" />
                  <span>COPY TO...</span>
                </button>

                <button
                  onClick={handleDuplicateToNext}
                  className="p-1 px-2.5 bg-[#141414] hover:bg-[#222] border border-[#262626] hover:border-[#00f0ff]/40 text-stone-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                  title="Duplicate current frame to next frame"
                >
                  <Plus className="w-3 h-3 text-[#00f0ff]" />
                  <span>DUPLICATE NEXT</span>
                </button>

                <button
                  onClick={handleClearAllFrames}
                  className="p-1 px-2.5 bg-[#141414] hover:bg-red-950/50 border border-[#262626] hover:border-red-500 text-stone-400 hover:text-red-400 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                  title="Clear all drawings, layers, and GIFs across ALL frames in this sequence"
                >
                  <Trash2 className="w-3 h-3 text-red-500" />
                  <span>CLEAR ALL</span>
                </button>
              </div>
            </div>

            {/* Frame Cards Strip */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {currentZoneArtwork.frames.map((frame, idx) => {
                const isSelected = idx === activeFrameIndex;
                const hasStrokes = frame.strokes.length > 0;
                const hasImage = !!frame.imageDataUrl;

                return (
                  <div
                    key={idx}
                    className={`group/card flex-1 min-w-[75px] max-w-[100px] h-16 border flex flex-col items-center justify-between p-1 transition-all cursor-pointer relative ${
                      isSelected
                        ? "bg-[#00f0ff]/10 border-[#00f0ff] text-white shadow-[0_0_10px_rgba(0,240,255,0.2)]"
                        : "bg-[#111] border-[#222] text-stone-400 hover:border-[#333]"
                    }`}
                    onClick={() => {
                      setActiveFrameIndex(idx);
                      if (isPlayingCurve) setIsPlayingCurve(false);
                    }}
                  >
                    <div className="w-full flex items-center justify-between text-[9px] font-mono font-bold">
                      <span className={isSelected ? "text-[#00f0ff]" : "text-stone-400"}>
                        F{idx + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        {hasImage && <ImageIcon className="w-2.5 h-2.5 text-[#ff007f]" />}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCopyModal(idx);
                          }}
                          className="opacity-0 group-hover/card:opacity-100 hover:text-[#00f0ff] p-0.5 transition-opacity"
                          title={`Copy Frame #${idx + 1} artwork to other frames`}
                        >
                          <Copy className="w-2.5 h-2.5" />
                        </button>
                        {(hasStrokes || hasImage) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearFrame(idx);
                            }}
                            className="opacity-0 group-hover/card:opacity-100 hover:text-red-400 p-0.5 transition-opacity"
                            title={`Clear Frame #${idx + 1} artwork`}
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Thumbnail preview */}
                    <div className="w-full flex-1 bg-black/60 my-0.5 flex items-center justify-center overflow-hidden relative">
                      {hasImage ? (
                        <img
                          src={frame.imageDataUrl}
                          alt={`F${idx + 1}`}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : hasStrokes ? (
                        <Palette className="w-3.5 h-3.5 text-[#00f0ff] opacity-80" />
                      ) : (
                        <span className="text-[8px] text-stone-600 font-mono">Empty</span>
                      )}
                    </div>

                    <div className="text-[8px] text-stone-500 font-mono">
                      {hasStrokes ? `${frame.strokes.length} strokes` : hasImage ? "Image" : "Blank"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Drawing Tools & GIF Finder */}
        <StudioRightSidebar
          currentTool={currentTool}
          onSelectTool={(t) => setCurrentTool(t)}
          brushColor={brushColor}
          onChangeBrushColor={setBrushColor}
          brushSize={brushSize}
          onChangeBrushSize={setBrushSize}
          onionSkinning={onionSkinning}
          onToggleOnionSkinning={() => setOnionSkinning(!onionSkinning)}
          onionOpacity={onionOpacity}
          onChangeOnionOpacity={setOnionOpacity}
          clipToContour={clipToContour}
          onToggleClipToContour={() => setClipToContour(!clipToContour)}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClearFrame={handleClearFrame}
          onClearAllFrames={handleClearAllFrames}
          onQuickCopyAll={() => handleQuickCopyAll(activeFrameIndex)}
          onOpenCopyModal={() => handleOpenCopyModal(activeFrameIndex)}
          targetZoneSettings={currentSettings}
          activeFrameIndex={activeFrameIndex}
          totalFrames={frameCount}
          currentZoneArtwork={currentZoneArtwork}
          activeFrameImageDataUrl={currentFrame.imageDataUrl}
          imageTransform={currentFrame.imageTransform || { x: 0, y: 0, scale: 1, rotation: 0 }}
          onChangeImageTransform={handleUpdateImageTransform}
          onFitImageToCurve={handleFitImageToCurve}
          onFillImageToCurve={handleFillImageToCurve}
          onResetImageTransform={handleResetImageTransform}
          onRemoveFrameImage={handleRemoveFrameImage}
          syncTransformToAll={syncTransformToAll}
          onToggleSyncTransformToAll={() => setSyncTransformToAll(!syncTransformToAll)}
          onScaleRightDelta={handleScaleRight}
          motionAnalysis={motionAnalysis}
          onOpenMotionAdvisorModal={() => setIsMotionModalOpen(true)}
          onApplyGifFrames={handleApplyGifFrames}
          onOpenFullGifTrimmerModal={() => setIsGifTrimmerOpen(true)}
          onOpenFullGiphyModal={() => setIsGiphyModalOpen(true)}
          onOpenUploadGifModal={() => setIsUploadGifModalOpen(true)}
          onTriggerImageUpload={() => imageInputRef.current?.click()}
          showStatus={showStatus}
        />
      </main>

      {/* Upload GIF with Category Selector Modal */}
      <UploadGifModal
        isOpen={isUploadGifModalOpen}
        onClose={() => setIsUploadGifModalOpen(false)}
        targetZoneSettings={currentSettings}
        onApplyFrames={handleApplyGifFrames}
        showStatus={showStatus}
      />

      {/* Frame Copy Modal */}
      <CopyFrameModal
        isOpen={isCopyModalOpen}
        onClose={() => setIsCopyModalOpen(false)}
        sourceFrameIndex={copyModalSourceIndex}
        totalFrames={frameCount}
        frames={currentZoneArtwork.frames}
        zoneSettings={currentSettings}
        onApplyCopy={handleApplyCustomCopy}
      />

      {/* GIF Trimmer Modal */}
      <GifTrimmerModal
        isOpen={isGifTrimmerOpen}
        onClose={() => setIsGifTrimmerOpen(false)}
        targetZoneSettings={currentSettings}
        onApplyFrames={handleApplyGifFrames}
        showStatus={showStatus}
      />

      {/* GIPHY Search & Slice Modal */}
      <GiphySearchModal
        isOpen={isGiphyModalOpen}
        onClose={() => setIsGiphyModalOpen(false)}
        targetZoneSettings={currentSettings}
        onApplyFrames={handleApplyGifFrames}
        showStatus={showStatus}
      />

      {/* AI Scanimation Motion Choreography Blueprint Modal */}
      {motionAnalysis && (
        <MotionChoreographyModal
          isOpen={isMotionModalOpen}
          onClose={() => setIsMotionModalOpen(false)}
          archetype={motionAnalysis.primaryRecommendation}
          metrics={motionAnalysis.metrics}
          zoneSettings={currentSettings}
          onApplyRecommendation={(arch) => {
            if (currentSettings && onUpdateZoneSettings) {
              const newSettings: ZoneSettings = {
                ...currentSettings,
                revealDirection: arch.recommendedSettings.revealDirection,
                frameCount: arch.recommendedSettings.frameCount,
                windowWidth: arch.recommendedSettings.windowWidth,
                notes: `${currentSettings.notes ? currentSettings.notes + "\n" : ""}[ADVISOR]: Tuned for '${arch.name}' (${arch.recommendedSettings.revealDirection.angle}° Parallax, ${arch.recommendedSettings.frameCount} phases).`,
              };
              onUpdateZoneSettings(newSettings);
              showStatus?.(`Applied calibration for '${arch.name}'!`, "success");
            }
          }}
        />
      )}
    </div>
  );
}
