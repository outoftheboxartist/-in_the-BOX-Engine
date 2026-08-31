/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { ZoneListSidebar } from "./components/ZoneListSidebar";
import { SvgCanvas } from "./components/SvgCanvas";
import { ZonePropertiesPanel } from "./components/ZonePropertiesPanel";
import { ProjectData, SVGZoneInfo, ZoneSettings, ZoneArtwork, BaseDocSize } from "./types";
import { SAMPLE_SVGS } from "./sampleSvgs";
import { instrumentSVG, createDefaultSettingsForZones } from "./svgParser";
import { Download, Upload, Info, RotateCcw, HelpCircle, HardDrive, Sparkles, CheckCircle2, Eye, Image as ImageIcon, Palette, Film, ArrowLeft, Undo2, Redo2, Ruler } from "lucide-react";
import { ImageTracerModal } from "./components/ImageTracerModal";
import { ColorPickerTracerModal } from "./components/ColorPickerTracerModal";
import { ExportPreviewModal } from "./components/ExportPreviewModal";
import { StitchedArtworkPreviewModal } from "./components/StitchedArtworkPreviewModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FrameArtworkStage } from "./components/FrameArtworkStage";
import { CruciformIcon } from "./components/CruciformIcon";
import { generateLinesData, clipLineToPolygon, getPolygonFromElement } from "./utils/slicing";
import { BASE_WINDOW_PRESETS } from "./utils/curveSizeAdvisor";
import { decodeGifFromUrl, resampleGifFrames } from "./utils/gifDecoder";
import { CreatureMotionArchetype } from "./utils/motionSuggester";
import {
  saveZoneArtworksToDb,
  loadZoneArtworksFromDb,
  safeSetLocalStorage,
  safeGetLocalStorage,
} from "./utils/storageDb";

export default function App() {
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  // Stage Switcher State: "mapper" (multi-vector mapper & slice preview) vs "artwork" (frame artwork creator stage)
  const [currentStage, setCurrentStage] = useState<"mapper" | "artwork">("mapper");

  // Core App State
  const [projectName, setProjectName] = useState<string>("Untethered Illusion");
  const [fileName, setFileName] = useState<string>("illusion-box.svg");
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [originalSvgContent, setOriginalSvgContent] = useState<string>("");
  const [zones, setZones] = useState<SVGZoneInfo[]>([]);
  const [zoneSettings, setZoneSettings] = useState<Record<string, ZoneSettings>>({});
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [hiddenZoneIds, setHiddenZoneIds] = useState<Record<string, boolean>>({});

  // Base Working Window & Print Size (Always starts with A4 as standard base window size)
  const [baseDocSize, setBaseDocSize] = useState<BaseDocSize>(() => {
    return (
      safeGetLocalStorage("scanimation_base_doc_size") || {
        label: "A4 (210 × 297 mm)",
        widthInches: 8.27,
        heightInches: 11.69,
        unit: "mm",
      }
    );
  });

  useEffect(() => {
    safeSetLocalStorage("scanimation_base_doc_size", baseDocSize);
  }, [baseDocSize]);

  // Stop-motion frame artwork for each curve/zone
  const [zoneArtworks, setZoneArtworks] = useState<Record<string, ZoneArtwork>>({});

  const handleToggleZoneVisibility = (zoneId: string) => {
    setHiddenZoneIds((prev) => ({
      ...prev,
      [zoneId]: !prev[zoneId],
    }));
  };

  const handleUpdateZoneArtwork = (zoneId: string, artwork: ZoneArtwork) => {
    setZoneArtworks((prev) => ({
      ...prev,
      [zoneId]: artwork,
    }));
  };

  // Modal & Notification Toast State
  const [showWelcome, setShowWelcome] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Mobile View Tabs State
  const [activeMobileTab, setActiveMobileTab] = useState<"layers" | "canvas" | "properties">("canvas");

  // Image Tracer Trigger State
  const [isImageTracerOpen, setIsImageTracerOpen] = useState<boolean>(false);
  const [isColorTracerOpen, setIsColorTracerOpen] = useState<boolean>(false);
  const [droppedImageFile, setDroppedImageFile] = useState<File | null>(null);
  const [isExportPreviewOpen, setIsExportPreviewOpen] = useState<boolean>(false);
  const [isStitchedPreviewOpen, setIsStitchedPreviewOpen] = useState<boolean>(false);

  // Slices preview calibration State
  const [isSlicingPreviewActive, setIsSlicingPreviewActive] = useState<boolean>(true);
  const [slicingPhase, setSlicingPhase] = useState<number>(0.0);
  const [slicingScale, setSlicingScale] = useState<number>(1.0); // pixels per mm
  const [slicingMode, setSlicingMode] = useState<"cutting" | "bars" | "wireframe" | "both">("wireframe");

  // Status message auto-clear
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => {
        setStatusMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  const showStatus = (text: string, type: "success" | "error" | "info" = "success") => {
    setStatusMessage({ text, type });
  };

  // Load saved state or default template on initial mount
  useEffect(() => {
    async function initSession() {
      try {
        const savedProjectName = safeGetLocalStorage("inthebox_projectName");
        const savedFileName = safeGetLocalStorage("inthebox_fileName");
        const savedSvgContent = safeGetLocalStorage("inthebox_svgContent");
        const savedOriginalSvgContent = safeGetLocalStorage("inthebox_originalSvgContent");
        const savedZones = safeGetLocalStorage("inthebox_zones");
        const savedZoneSettings = safeGetLocalStorage("inthebox_zoneSettings");
        const savedSelectedZoneId = safeGetLocalStorage("inthebox_selectedZoneId");
        const savedShowWelcome = safeGetLocalStorage("inthebox_showWelcome");
        const savedIsSlicingActive = safeGetLocalStorage("inthebox_isSlicingPreviewActive");
        const savedSlicingScale = safeGetLocalStorage("inthebox_slicingScale");
        const savedSlicingMode = safeGetLocalStorage("inthebox_slicingMode");

        // Clean up any legacy localStorage entry that causes quota errors
        try {
          localStorage.removeItem("inthebox_zoneArtworks");
        } catch {
          // ignore
        }

        if (savedSvgContent && savedZones && savedZoneSettings) {
          if (savedProjectName) setProjectName(savedProjectName);
          if (savedFileName) setFileName(savedFileName);
          setSvgContent(savedSvgContent);
          if (savedOriginalSvgContent) setOriginalSvgContent(savedOriginalSvgContent);
          setZones(JSON.parse(savedZones));
          setZoneSettings(JSON.parse(savedZoneSettings));
          setSelectedZoneId(savedSelectedZoneId || null);
          if (savedShowWelcome !== null) setShowWelcome(savedShowWelcome === "true");
          if (savedIsSlicingActive !== null) setIsSlicingPreviewActive(savedIsSlicingActive === "true");
          if (savedSlicingScale !== null) setSlicingScale(parseFloat(savedSlicingScale));
          if (savedSlicingMode !== null) setSlicingMode(savedSlicingMode as "cutting" | "bars");

          // Load rich artwork frames from IndexedDB
          try {
            const dbArtworks = await loadZoneArtworksFromDb();
            if (dbArtworks && Object.keys(dbArtworks).length > 0) {
              setZoneArtworks(dbArtworks);
            }
          } catch (e) {
            console.warn("Could not load artwork from IndexedDB:", e);
          }

          showStatus("Restored your active scanimation session!", "info");
        } else {
          loadTemplate(0); // Load Illusion Box default
        }
      } catch (err) {
        console.warn("Failed to load from storage, starting clean", err);
        loadTemplate(0);
      }
    }

    initSession();
  }, []);

  // Persist configurations safely to localStorage and IndexedDB
  useEffect(() => {
    if (svgContent) {
      safeSetLocalStorage("inthebox_projectName", projectName);
      safeSetLocalStorage("inthebox_fileName", fileName);
      safeSetLocalStorage("inthebox_svgContent", svgContent);
      safeSetLocalStorage("inthebox_originalSvgContent", originalSvgContent);
      safeSetLocalStorage("inthebox_zones", JSON.stringify(zones));
      safeSetLocalStorage("inthebox_zoneSettings", JSON.stringify(zoneSettings));
      safeSetLocalStorage("inthebox_selectedZoneId", selectedZoneId || "");
      safeSetLocalStorage("inthebox_showWelcome", String(showWelcome));
      safeSetLocalStorage("inthebox_isSlicingPreviewActive", String(isSlicingPreviewActive));
      safeSetLocalStorage("inthebox_slicingScale", String(slicingScale));
      safeSetLocalStorage("inthebox_slicingMode", slicingMode);

      // Persist stop-motion artwork frames to IndexedDB
      if (Object.keys(zoneArtworks).length > 0) {
        saveZoneArtworksToDb(zoneArtworks);
      }
    }
  }, [
    projectName,
    fileName,
    svgContent,
    originalSvgContent,
    zones,
    zoneSettings,
    selectedZoneId,
    showWelcome,
    isSlicingPreviewActive,
    slicingScale,
    slicingMode,
    zoneArtworks,
  ]);

  // Update a single zone's settings
  const handleUpdateZoneSettings = (updated: ZoneSettings) => {
    setZoneSettings((prev) => ({
      ...prev,
      [updated.zoneId]: updated,
    }));
  };

  // Inline rename curve across all instances & lists
  const handleRenameZone = (zoneId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setZones((prev) =>
      prev.map((z) => (z.id === zoneId ? { ...z, defaultName: trimmed } : z))
    );
    setZoneSettings((prev) => {
      const existing = prev[zoneId];
      if (!existing) return prev;
      return {
        ...prev,
        [zoneId]: {
          ...existing,
          zoneName: trimmed,
        },
      };
    });
    showStatus(`✓ Renamed curve to "${trimmed}"`, "success");
  };

  // Inline change frame count across all instances (0 or 1 = Solid curve)
  const handleChangeZoneFrames = (zoneId: string, newFrames: number) => {
    const raw = Math.round(newFrames);
    const count = isNaN(raw) ? 0 : Math.max(0, Math.min(24, raw));
    const isSolid = count <= 1;
    setZoneSettings((prev) => {
      const existing = prev[zoneId];
      if (!existing) return prev;
      return {
        ...prev,
        [zoneId]: {
          ...existing,
          frameCount: count,
          isSolid: isSolid,
          solidColor: existing.solidColor || "#000000",
        },
      };
    });
    const curveName = zoneSettings[zoneId]?.zoneName || "Curve";
    if (isSolid) {
      showStatus(`✓ "${curveName}" set to ${count} frames → converted to SOLID curve (no frames)`, "info");
    } else {
      showStatus(`✓ Updated "${curveName}" to ${count} frames across all instances`, "success");
    }
  };

  // Handle template selection
  const loadTemplate = (index: number) => {
    try {
      const template = SAMPLE_SVGS[index];
      const result = instrumentSVG(template.content);
      
      setFileName(`${template.name.toLowerCase().replace(/\s+/g, "-")}.svg`);
      setProjectName(template.name);
      setSvgContent(result.instrumentedSvgContent);
      setOriginalSvgContent(template.content);
      setZones(result.zones);
      
      const defaults = createDefaultSettingsForZones(result.zones);
      setZoneSettings(defaults);
      setSelectedZoneId(result.zones.length > 0 ? result.zones[0].id : null);
      
      showStatus(`Template "${template.name}" successfully loaded!`, "success");
    } catch (err: any) {
      showStatus(err.message || "Error loading template", "error");
    }
  };

  // Handle uploaded SVG file
  const handleSvgUpload = (file: File) => {
    // If it's a raster image upload, redirect it beautifully to our Tracer Modal
    if (/\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name) || file.type.startsWith("image/")) {
      setDroppedImageFile(file);
      setIsImageTracerOpen(true);
      showStatus("Raster file detected. Calibrating vector outline tracer...", "info");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const result = instrumentSVG(text);
        
        setFileName(file.name);
        setProjectName(file.name.replace(/\.[^/.]+$/, ""));
        setSvgContent(result.instrumentedSvgContent);
        setOriginalSvgContent(text);
        setZones(result.zones);
        
        const defaults = createDefaultSettingsForZones(result.zones);
        setZoneSettings(defaults);
        
        // Auto-select first zone
        setSelectedZoneId(result.zones.length > 0 ? result.zones[0].id : null);
        
        showStatus(`Successfully parsed ${result.zones.length} shapes from "${file.name}"`, "success");
      } catch (err: any) {
        showStatus(`Parsing failed: ${err.message || "Invalid SVG file"}`, "error");
      }
    };
    reader.readAsText(file);
  };

  // Drag and Drop files upload helper on window viewport
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const isSvg = file.name.toLowerCase().endsWith(".svg");
      const isJson = file.name.toLowerCase().endsWith(".json");
      const isImg = /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name) || file.type.startsWith("image/");

      if (isSvg) {
        handleSvgUpload(file);
      } else if (isJson) {
        loadProjectFromFile(file);
      } else if (isImg) {
        setDroppedImageFile(file);
        setIsImageTracerOpen(true);
        showStatus("Image dropped. Opening vectorizer settings...", "info");
      } else {
        showStatus("Unsupported file format. Drop an SVG, compatible image, or project JSON.", "error");
      }
    }
  };

  // Save full project data as JSON file
  const handleSaveProject = () => {
    try {
      const projectData: ProjectData = {
        projectName,
        fileName,
        svgContent: svgContent || "",
        originalSvgContent,
        zones,
        settings: zoneSettings,
        artworks: zoneArtworks,
        baseDocSize,
        updatedAt: new Date().toISOString(),
      };

      const jsonString = JSON.stringify(projectData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      const safeProjectName = projectName.toLowerCase().replace(/[^a-z0-9]/gi, "-");
      link.href = url;
      link.download = `inthebox-project-${safeProjectName}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showStatus("Project settings and frame artworks exported successfully!", "success");
    } catch (err: any) {
      showStatus(`Export failed: ${err.message}`, "error");
    }
  };

  // Trigger project JSON load
  const handleLoadProjectClick = () => {
    jsonFileInputRef.current?.click();
  };

  const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      loadProjectFromFile(e.target.files[0]);
    }
  };

  // Parse and restore imported JSON project Data
  const loadProjectFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const projectData = JSON.parse(text) as ProjectData;
        
        // Robust structural validation checks
        if (!projectData.originalSvgContent || !projectData.settings) {
          throw new Error("Missing critical SVG content or zone settings in json.");
        }

        // Re-instrument raw SVG in case structure matches or to assure clean rendering
        const result = instrumentSVG(projectData.originalSvgContent);
        
        setProjectName(projectData.projectName || file.name.replace(".json", ""));
        setFileName(projectData.fileName || "imported.svg");
        setSvgContent(result.instrumentedSvgContent);
        setOriginalSvgContent(projectData.originalSvgContent);
        setZones(result.zones);
        
        // Map settings back intelligently, preserving loaded configurations
        const restoredSettings = createDefaultSettingsForZones(result.zones, projectData.settings);
        setZoneSettings(restoredSettings);

        if (projectData.artworks) {
          setZoneArtworks(projectData.artworks);
        }

        if (projectData.baseDocSize) {
          setBaseDocSize(projectData.baseDocSize);
        }
        
        setSelectedZoneId(result.zones.length > 0 ? result.zones[0].id : null);
        
        showStatus(`Project "${projectData.projectName || "imported"}" active!`, "success");
      } catch (err: any) {
        showStatus(`Invalid project format: ${err.message}`, "error");
      }
    };
    reader.readAsText(file);
  };

  // Reset to current template default settings
  const handleResetSettings = () => {
    if (window.confirm("Are you sure you want to discard all custom settings and revert to default values for this layout?")) {
      const defaults = createDefaultSettingsForZones(zones);
      setZoneSettings(defaults);
      showStatus("Reverted all shapes to baseline settings.", "info");
    }
  };

  // Get current active selection details
  const getSelectedZoneInfo = () => {
    if (!selectedZoneId) return null;
    return zones.find((z) => z.id === selectedZoneId) || null;
  };

  const activeZoneInfo = getSelectedZoneInfo();

  // Handle vector trace finish
  const handleVectorGenerated = (tracedSvg: string, trackedFileName: string) => {
    try {
      const result = instrumentSVG(tracedSvg);
      setFileName(trackedFileName || "traced-curves.svg");
      setProjectName(trackedFileName.replace(/\.[^/.]+$/, "").replace("-traced", ""));
      setSvgContent(result.instrumentedSvgContent);
      setOriginalSvgContent(tracedSvg);
      setZones(result.zones);
      
      const defaults = createDefaultSettingsForZones(result.zones);
      setZoneSettings(defaults);
      setSelectedZoneId(result.zones.length > 0 ? result.zones[0].id : null);
      
      setActiveMobileTab("canvas");
    } catch (err: any) {
      showStatus(`Failed to parse traced curves: ${err.message}`, "error");
    }
  };

  // Appends a custom color-traced compound path directly to the current SVG and synchronized applet states
  const handleAddTracedPath = (pathD: string, colorHex: string, colorName: string): string => {
    try {
      const parser = new DOMParser();
      // Ensure we have an active SVG content to append to, or build a responsive base SVG wrapper
      const activeSvg = svgContent && svgContent.trim() !== "" 
        ? svgContent 
        : `<svg viewBox="0 0 400 400" width="100%" height="100%"><rect width="400" height="400" fill="transparent" /></svg>`;
      
      const doc = parser.parseFromString(activeSvg, "image/svg+xml");
      const svgElement = doc.querySelector("svg");
      if (!svgElement) {
        throw new Error("Target parent SVG element not found in active workbook.");
      }

      // Generate unique layer ID and descriptive human label for color
      const zoneId = `zone-color-${Date.now()}-${zones.length}`;
      const uniqueName = `${colorName} Region #${zones.length + 1}`;

      const pathEl = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      pathEl.setAttribute("d", pathD);
      pathEl.setAttribute("fill", `${colorHex}50`); // 31% transparent color fill
      pathEl.setAttribute("stroke", colorHex);
      pathEl.setAttribute("stroke-width", "2");
      pathEl.setAttribute("data-zone-id", zoneId);
      pathEl.setAttribute("role", "button");

      svgElement.appendChild(pathEl);

      const serializer = new XMLSerializer();
      const updatedSvgText = serializer.serializeToString(doc);

      const newZone: SVGZoneInfo = {
        id: zoneId,
        tagName: "path",
        originalId: null,
        defaultName: uniqueName
      };

      const newSetting: ZoneSettings = {
        zoneId: zoneId,
        tagName: "path",
        originalId: null,
        zoneName: uniqueName,
        frameCount: 6,
        windowWidth: 1.0,
        revealDirection: {
          dx: 1.0,
          dy: 0.0,
          angle: 0
        },
        notes: `Interactively traced color ${colorHex} (${colorName})`,
      };

      setSvgContent(updatedSvgText);
      setOriginalSvgContent(updatedSvgText);
      setZones((prev) => [...prev, newZone]);
      setZoneSettings((prev) => ({
        ...prev,
        [zoneId]: newSetting
      }));
      setSelectedZoneId(zoneId);
      
      showStatus(`Injected ${uniqueName} vector shape to workspace layers!`, "success");
      return zoneId;
    } catch (err: any) {
      showStatus(`Failed to compile color layer: ${err.message}`, "error");
      return "";
    }
  };

  const handleUpdateTracedPath = (zoneId: string, updatedName: string, updatedColorHex: string) => {
    try {
      if (!svgContent) return;

      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, "image/svg+xml");
      const pathEl = doc.querySelector(`[data-zone-id="${zoneId}"]`);
      if (pathEl) {
        pathEl.setAttribute("fill", `${updatedColorHex}50`);
        pathEl.setAttribute("stroke", updatedColorHex);
      }

      const serializer = new XMLSerializer();
      const updatedSvgText = serializer.serializeToString(doc);

      setSvgContent(updatedSvgText);
      setOriginalSvgContent(updatedSvgText);

      setZones((prev) => 
        prev.map((z) => z.id === zoneId ? { ...z, defaultName: updatedName } : z)
      );

      setZoneSettings((prev) => {
        const existing = prev[zoneId];
        if (!existing) return prev;
        return {
          ...prev,
          [zoneId]: {
            ...existing,
            zoneName: updatedName,
            notes: `Interactively updated color ${updatedColorHex} (${updatedName})`,
          }
        };
      });
    } catch (err: any) {
      console.error("Failed to update last traced path live:", err);
    }
  };

  const handleRemoveTracedPath = (zoneId: string) => {
    try {
      if (!svgContent) return;

      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, "image/svg+xml");
      const pathEl = doc.querySelector(`[data-zone-id="${zoneId}"]`);
      if (pathEl) {
        pathEl.remove();
      }

      const serializer = new XMLSerializer();
      const updatedSvgText = serializer.serializeToString(doc);

      setSvgContent(updatedSvgText);
      setOriginalSvgContent(updatedSvgText);

      setZones((prev) => prev.filter((z) => z.id !== zoneId));
      setZoneSettings((prev) => {
        const copy = { ...prev };
        delete copy[zoneId];
        return copy;
      });

      setSelectedZoneId((prev) => prev === zoneId ? null : prev);
      showStatus("Reverted last added island shape.", "info");
    } catch (err: any) {
      console.error("Failed to remove traced path:", err);
    }
  };

  // 1-Click Load AI Archetype Motion & GIF frames into the active zone
  const handleLoadArchetypeAnimation = async (zoneId: string, archetype: CreatureMotionArchetype) => {
    try {
      const currentSetting = zoneSettings[zoneId];
      const targetCount = archetype.recommendedSettings.frameCount || 6;

      // 1. Update zone calibration parameters
      if (currentSetting) {
        const updatedSetting: ZoneSettings = {
          ...currentSetting,
          revealDirection: { ...archetype.recommendedSettings.revealDirection },
          frameCount: targetCount,
          windowWidth: archetype.recommendedSettings.windowWidth,
        };
        handleUpdateZoneSettings(updatedSetting);
      }

      showStatus(`Slicing '${archetype.name}' animation frames into ${currentSetting?.zoneName || "curve"}...`, "info");

      // 2. Decode or generate frame sequence
      let frameDataUrls: string[] = [];
      const gifUrl = archetype.gifUrl || archetype.gifPreviewUrl;

      if (gifUrl) {
        try {
          const decoded = await decodeGifFromUrl(gifUrl);
          const rawUrls = decoded.frames.map((f) => f.dataUrl);
          frameDataUrls = resampleGifFrames(rawUrls, targetCount);
        } catch (decodeErr) {
          console.warn("Direct GIF decode failed, using synthetic fallback:", decodeErr);
        }
      }

      if (frameDataUrls.length > 0) {
        const existingArt = zoneArtworks[zoneId] || {
          zoneId,
          frames: [],
          activeFrameIndex: 0,
          onionSkinning: true,
          onionSkinOpacity: 0.35,
        };

        const newFrames = [];
        for (let i = 0; i < targetCount; i++) {
          newFrames.push({
            frameIndex: i,
            strokes: existingArt.frames[i]?.strokes || [],
            imageDataUrl: frameDataUrls[i] || frameDataUrls[0],
            imageTransform: existingArt.frames[i]?.imageTransform || { x: 0, y: 0, scale: 1, rotation: 0 },
          });
        }

        setZoneArtworks((prev) => ({
          ...prev,
          [zoneId]: {
            ...existingArt,
            frames: newFrames,
            activeFrameIndex: 0,
          },
        }));
      }

      // 3. Activate slicing preview and transition to Artwork Studio
      setSelectedZoneId(zoneId);
      setIsSlicingPreviewActive(true);
      setCurrentStage("artwork");
      showStatus(`⚡ Added '${archetype.name}' into final sliced project!`, "success");
    } catch (err: any) {
      showStatus(`Failed to load animation: ${err.message}`, "error");
    }
  };

  // Export slice lines trimmed to standard clipPath of selected curve
  const handleExportSlices = () => {
    if (!selectedZoneId) {
      showStatus("Please select a shape layer to slice first.", "error");
      return;
    }
    const settings = zoneSettings[selectedZoneId];
    if (!settings) return;

    const shapeEl = document.querySelector(`[data-zone-id="${selectedZoneId}"]`);
    if (!shapeEl) {
      showStatus("Target shape layer not found in raw canvas.", "error");
      return;
    }

    try {
      const svgEl = document.querySelector("#scanimation-canvas-container svg");
      const viewBox = svgEl?.getAttribute("viewBox") || "0 0 500 500";

      // Clone target shape to build clean, compliant clip-path geometry
      const shapeClone = shapeEl.cloneNode(true) as SVGElement;
      shapeClone.removeAttribute("id");
      shapeClone.removeAttribute("class");
      shapeClone.removeAttribute("style");
      shapeClone.removeAttribute("data-zone-id");
      shapeClone.removeAttribute("filter");
      shapeClone.removeAttribute("role");
      shapeClone.setAttribute("fill", "#000000"); // Neutral color

      // Get bbox coordinates in SVG space
      const bbox = (shapeEl as unknown as SVGGraphicsElement).getBBox();
      const { lines, lineThickness } = generateLinesData(bbox, settings, slicingScale, slicingPhase);

      const clipPathId = `clip-trim-${selectedZoneId}`;
      let linesGroupContent = "";

      if (slicingMode === "cutting") {
        let pathD = "";
        lines.forEach((l) => {
          pathD += `M ${l.x1.toFixed(1)} ${l.y1.toFixed(1)} L ${l.x2.toFixed(1)} ${l.y2.toFixed(1)} `;
        });
        linesGroupContent = `
    <!-- Thin cut line paths trimmed to closed curve boundary -->
    <path 
      d="${pathD.trim()}" 
      stroke="#ff0055" 
      stroke-width="0.8" 
      stroke-linecap="round" 
      fill="none" 
    />`;
      } else {
        // Physical Opaque bars
        const barLinesData = generateLinesData(bbox, settings, slicingScale, slicingPhase, true);
        let pathD = "";
        barLinesData.lines.forEach((l) => {
          pathD += `M ${l.x1.toFixed(1)} ${l.y1.toFixed(1)} L ${l.x2.toFixed(1)} ${l.y2.toFixed(1)} `;
        });
        linesGroupContent = `
    <!-- Physical opaque bars trimmed to closed curve boundary -->
    <path 
      d="${pathD.trim()}" 
      stroke="#0f172a" 
      stroke-width="${barLinesData.lineThickness.toFixed(2)}" 
      stroke-linecap="butt" 
      fill="none" 
    />`;
      }

      const serializer = new XMLSerializer();
      const shapeCloneStr = serializer.serializeToString(shapeClone);

      const exportedSvg = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">
  <defs>
    <!-- Trimming Boundary ClipPath derived from closed curve '${projectName}' -->
    <clipPath id="${clipPathId}">
      ${shapeCloneStr}
    </clipPath>
  </defs>

  <!-- Ground context reference shape -->
  <g opacity="0.15">
    ${shapeCloneStr}
  </g>

  <!-- Trimmed Scanimation Vector Slices -->
  <g clip-path="url(#${clipPathId})">
    ${linesGroupContent}
  </g>
</svg>`;

      const blob = new Blob([exportedSvg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const cleanZoneName = settings.zoneName.toLowerCase().replace(/[^a-z0-9_]+/g, "-");
      link.href = url;
      link.download = `${projectName}-${cleanZoneName}-slices-${slicingMode}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showStatus(`Trimmed vector SVG for "${settings.zoneName}" exported!`, "success");
    } catch (err: any) {
      showStatus(`Vector slicing failure: ${err.message}`, "error");
    }
  };

  // Export Cricut Design Space Cut-Ready SVG file with mathematically clipped lines
  const handleExportCricutSlices = () => {
    if (!selectedZoneId) {
      showStatus("Please select a shape layer to slice first.", "error");
      return;
    }
    const settings = zoneSettings[selectedZoneId];
    if (!settings) return;

    const shapeEl = document.querySelector(`[data-zone-id="${selectedZoneId}"]`);
    if (!shapeEl) {
      showStatus("Target shape layer not found in raw canvas.", "error");
      return;
    }

    try {
      const svgEl = document.querySelector("#scanimation-canvas-container svg");
      const viewBox = svgEl?.getAttribute("viewBox") || "0 0 500 500";

      // 1. Get polygon points for clipping
      const polygon = getPolygonFromElement(shapeEl as SVGElement);
      if (polygon.length < 3) {
        showStatus("Could not extract clean boundary curve for this shape. Try checking your SVG or Tracing bounds.", "error");
        return;
      }

      // 2. Get bbox and lines
      const bbox = (shapeEl as unknown as SVGGraphicsElement).getBBox();
      const rawLinesData = slicingMode === "bars" 
        ? generateLinesData(bbox, settings, slicingScale, slicingPhase, true)
        : generateLinesData(bbox, settings, slicingScale, slicingPhase, false);

      // 3. Clip all lines mathematically to polygon boundary
      const clippedSegments: typeof rawLinesData.lines = [];
      rawLinesData.lines.forEach((l) => {
        const segments = clipLineToPolygon(l, polygon);
        clippedSegments.push(...segments);
      });

      if (clippedSegments.length === 0) {
        showStatus("No cut slices fell inside the selected shape layer boundary.", "error");
        return;
      }

      // 4. Build compound path tag for the slices string
      let pathD = "";
      clippedSegments.forEach((s) => {
        pathD += `M ${s.x1.toFixed(2)} ${s.y1.toFixed(2)} L ${s.x2.toFixed(2)} ${s.y2.toFixed(2)} `;
      });

      // Clone target shape to build backing/outer silhouette for cutting
      const shapeClone = shapeEl.cloneNode(true) as SVGElement;
      shapeClone.removeAttribute("id");
      shapeClone.removeAttribute("class");
      shapeClone.removeAttribute("style");
      shapeClone.removeAttribute("data-zone-id");
      shapeClone.removeAttribute("filter");
      shapeClone.removeAttribute("role");
      shapeClone.setAttribute("fill", "none");
      shapeClone.setAttribute("stroke", "#1e293b"); // Silhouette slate cutoff line
      shapeClone.setAttribute("stroke-width", "1.5");

      const serializer = new XMLSerializer();
      const shapeCloneStr = serializer.serializeToString(shapeClone);

      const cuttingThickness = slicingMode === "bars" ? rawLinesData.lineThickness : 1.0;

      const cricutSvgContent = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by Scanimation Studio for direct Cricut Cutting -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">
  <g id="cricut-backing-card">
    <desc>Cricut Outer Contour Layer (Set tool as Cut or Draw)</desc>
    ${shapeCloneStr}
  </g>
  <g id="cricut-slicing-cuts">
    <desc>Scanimation Parallel Slices (Direct cuts inside boundary without clipPaths)</desc>
    <path 
      d="${pathD.trim()}" 
      stroke="#00d8f6" 
      stroke-width="${cuttingThickness.toFixed(2)}" 
      stroke-linecap="round" 
      fill="none" 
    />
  </g>
</svg>`;

      const blob = new Blob([cricutSvgContent], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const cleanZoneName = settings.zoneName.toLowerCase().replace(/[^a-z0-9_]+/g, "-");
      link.href = url;
      link.download = `${projectName}-${cleanZoneName}-cricut-cut-${slicingMode}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showStatus(`Cricut CUT-READY SVG for "${settings.zoneName}" exported! Upload to Design Space, Attach, and Cut!`, "success");
    } catch (err: any) {
      showStatus(`Cricut export failure: ${err.message}`, "error");
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="flex flex-col h-screen bg-black text-stone-300 font-mono tracking-tight antialiased select-none overflow-hidden bg-scanlines bg-grid-cyber bg-blend-soft-light"
    >
      {/* Dynamic Toast Status Messages */}
      {statusMessage && (
        <div className="absolute top-16 right-6 z-50 animate-bounce shadow-2xl">
          <div
            className={`px-4 py-3 rounded border text-xs font-mono font-semibold flex items-center gap-2.5 backdrop-blur-md ${
              statusMessage.type === "success"
                ? "bg-[#ff0000]/10 text-[#ff0000] border-[#ff0000]/30"
                : statusMessage.type === "error"
                ? "bg-rose-950/90 text-rose-400 border-rose-500/30"
                : "bg-[#00f0ff]/10 text-[#00f0ff] border-[#00f0ff]/30"
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${statusMessage.type === "success" ? "bg-[#ff0000]" : statusMessage.type === "error" ? "bg-rose-500" : "bg-[#00f0ff]"} animate-ping`} />
            <span>{statusMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Workspace Header */}
      <header className="h-14 border-b border-[#262626] bg-black/90 backdrop-blur-md px-4 md:px-6 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3 md:gap-4 truncate">
          {/* Top Stage Navigation & Back Button */}
          {currentStage === "artwork" ? (
            <button
              onClick={() => setCurrentStage("mapper")}
              className="p-1.5 px-3 rounded bg-[#00f0ff]/15 hover:bg-[#00f0ff]/25 border border-[#00f0ff]/50 hover:border-[#00f0ff] text-[#00f0ff] font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_10px_rgba(0,240,255,0.2)] active:scale-95"
              title="Return to multi-vector mapper and SVG export screen"
            >
              <ArrowLeft className="w-4 h-4 text-[#00f0ff]" />
              <span className="tracking-wider font-mono">BACK TO MAPPER</span>
            </button>
          ) : (
            <button
              onClick={() => setCurrentStage("artwork")}
              className="p-1.5 px-3 rounded bg-[#ff007f]/15 hover:bg-[#ff007f]/25 border border-[#ff007f]/50 hover:border-[#ff007f] text-[#ff007f] font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_10px_rgba(255,0,127,0.2)] active:scale-95"
              title="Enter Frame Artwork Studio to draw or animate frames"
            >
              <Palette className="w-4 h-4 text-[#ff007f]" />
              <span className="tracking-wider font-mono">FRAME ARTWORK STUDIO →</span>
            </button>
          )}

          <div className="flex items-center gap-2.5 shrink-0">
            <CruciformIcon className="w-5 h-5 flex-shrink-0" glow />
            <h1 className="hidden sm:inline text-xs font-bold tracking-widest text-[#00f0ff] font-mono">
              [INTHE] BOX <span className="text-stone-500 font-normal">| SCANIMATION</span>
            </h1>
          </div>

          <div className="hidden sm:block h-4 w-[1px] bg-[#262626] shrink-0" />

          {/* Base Window / Print Working Size Selector */}
          <div className="flex items-center gap-1.5 bg-[#090d16] border border-[#00f0ff]/40 px-2 py-0.5 rounded shadow-[0_0_8px_rgba(0,240,255,0.15)] shrink-0">
            <Ruler className="w-3.5 h-3.5 text-[#00f0ff] shrink-0" />
            <div className="flex flex-col">
              <span className="text-[7px] font-mono font-bold text-stone-400 uppercase tracking-widest leading-none">
                BASE WINDOW SIZE
              </span>
              <select
                value={baseDocSize.label}
                onChange={(e) => {
                  const selected = BASE_WINDOW_PRESETS.find((p) => p.label === e.target.value);
                  if (selected) {
                    setBaseDocSize(selected);
                    showStatus(`✓ Base window size calibrated to ${selected.label}`, "info");
                  }
                }}
                className="bg-transparent border-none text-[10px] font-mono font-black text-[#00f0ff] focus:outline-none cursor-pointer py-0 pr-1 pl-0 leading-tight"
                title="Select base working window size (determines physical dimensions in mm/inches, Cricut mat scale, and optical slit calculations)"
              >
                {BASE_WINDOW_PRESETS.map((preset) => (
                  <option key={preset.label} value={preset.label} className="bg-black text-stone-200 font-mono text-[11px]">
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="hidden sm:block h-4 w-[1px] bg-[#262626] shrink-0" />

          {/* Editable Project Name */}
          <div className="flex items-center gap-2 truncate">
            <input
              id="project-name-input"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="bg-transparent border-b border-transparent hover:border-[#262626] focus:border-[#00f0ff]/50 text-xs font-mono font-bold text-[#00f0ff] focus:outline-none transition-colors px-1 text-left w-32 sm:w-44 truncate uppercase tracking-widest"
              placeholder="Artwork Name"
              title="Click to rename project"
            />
          </div>
        </div>

        {/* Global Toolbar buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Quick-Help Trigger */}
          <button
            onClick={() => setShowWelcome(true)}
            className="p-1.5 px-3 rounded bg-[#121212] hover:bg-[#1a1a1a] border border-[#262626] text-stone-300 transition-all text-[11px] flex items-center gap-1.5 font-bold font-mono cursor-pointer"
            title="Read Guide"
          >
            <HelpCircle className="w-3.5 h-3.5 text-[#00f0ff]" />
            <span className="hidden sm:inline">GUIDE</span>
          </button>

          {/* Reset current map */}
          <button
            onClick={handleResetSettings}
            className="p-1.5 px-3 rounded bg-[#121212] hover:bg-[#1a1a1a] border border-[#262626] text-stone-300 transition-all text-[11px] flex items-center gap-1.5 font-bold font-mono cursor-pointer"
            title="Reset active vector maps"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">RESET</span>
          </button>

          <div className="h-4 w-[1px] bg-[#262626] mx-1" />

          {/* Load Project from JSON */}
          <input
            ref={jsonFileInputRef}
            type="file"
            accept=".json"
            onChange={handleJsonFileChange}
            className="hidden"
            id="project-json-uploader"
          />
          <button
            onClick={handleLoadProjectClick}
            className="p-1.5 px-3 rounded bg-[#121212] hover:bg-[#1a1a1a] border border-[#262626] text-stone-300 hover:text-white flex items-center gap-1.5 text-[11px] font-bold font-mono transition-all cursor-pointer"
            title="Load existing project JSON file"
          >
            <Upload className="w-3.5 h-3.5 text-[#00f0ff]" />
            <span className="hidden xs:inline">LOAD</span>
          </button>

          {/* Save Settings */}
          <button
            onClick={handleSaveProject}
            className="p-1.5 px-3 rounded bg-[#121212] hover:bg-[#1a1a1a] border border-[#00f0ff]/20 hover:border-[#00f0ff]/40 text-[#00f0ff] flex items-center gap-1.5 text-[11px] font-bold font-mono transition-all cursor-pointer"
            title="Download full project configuration"
          >
            <Download className="w-3.5 h-3.5 text-[#00f0ff]" />
            <span className="hidden xs:inline">SAVE SETTINGS</span>
          </button>

          {/* Stitch & Preview All Sliced Artwork Button */}
          <button
            onClick={() => setIsStitchedPreviewOpen(true)}
            className="p-1.5 px-3.5 rounded bg-gradient-to-r from-[#ff007f] via-[#b026ff] to-[#00f0ff] hover:opacity-90 text-white font-black flex items-center gap-1.5 text-[11px] font-mono transition-all cursor-pointer active:scale-95 shadow-[0_0_15px_rgba(255,0,127,0.35)] border border-white/20 animate-pulse"
            title="Stitch all sliced artwork frame-by-frame for all curves and preview composite animation"
          >
            <Film className="w-3.5 h-3.5 text-white" />
            <span className="hidden sm:inline">STITCH & PREVIEW ALL ARTWORK</span>
          </button>

          {/* Export Preview & Slices Modal */}
          <button
            onClick={() => setIsExportPreviewOpen(true)}
            className="p-1.5 px-4 rounded bg-[#00f0ff] hover:bg-[#00c8d6] text-black font-black flex items-center gap-1.5 text-[11px] font-mono transition-all cursor-pointer active:scale-95 shadow-md"
            title="Preview all directional curves, inspect slices, and proceed to generate bottom layer artwork"
          >
            <Eye className="w-3.5 h-3.5 text-black" />
            <span className="hidden xs:inline">EXPORT PREVIEW</span>
          </button>
        </div>
      </header>

      {/* Persistent Offscreen SVG Mounting Node for Geometry Calculation */}
      {svgContent && (
        <div 
          id="scanimation-svg-mount" 
          className="fixed opacity-0 pointer-events-none -z-50 left-[-9999px] top-[-9999px]" 
          dangerouslySetInnerHTML={{ __html: svgContent }} 
        />
      )}

      {/* Main Workspace Stage Body */}
      {currentStage === "artwork" ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative z-10">
          <FrameArtworkStage
            zones={zones}
            zoneSettings={zoneSettings}
            zoneArtworks={zoneArtworks}
            selectedZoneId={selectedZoneId}
            onSelectZone={setSelectedZoneId}
            onUpdateZoneArtwork={handleUpdateZoneArtwork}
            onBackToMapper={() => setCurrentStage("mapper")}
            onOpenSeeAllPreview={() => setIsStitchedPreviewOpen(true)}
            slicingScale={slicingScale}
            slicingPhase={slicingPhase}
            svgContent={svgContent}
            projectName={projectName}
            showStatus={showStatus}
            onUpdateZoneSettings={handleUpdateZoneSettings}
            onRenameZone={handleRenameZone}
            onChangeZoneFrames={handleChangeZoneFrames}
          />
        </div>
      ) : (
        <>
          {/* Mobile Subtask Navigator Header Tabs */}
          <div className="flex md:hidden bg-[#0c0c0c] border-b border-[#262626] shrink-0 select-none z-20">
            <button
              onClick={() => setActiveMobileTab("layers")}
              className={`flex-1 py-3 text-center text-[11px] font-mono font-bold uppercase tracking-widest transition-colors border-b-2 ${
                activeMobileTab === "layers"
                  ? "border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/5 font-black"
                  : "border-transparent text-stone-400 hover:text-stone-200"
              }`}
            >
              LAYERS ({zones.length})
            </button>
            <button
              onClick={() => setActiveMobileTab("canvas")}
              className={`flex-1 py-3 text-center text-[11px] font-mono font-bold uppercase tracking-widest transition-colors border-b-2 ${
                activeMobileTab === "canvas"
                  ? "border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/5 font-black"
                  : "border-transparent text-stone-400 hover:text-stone-200"
              }`}
            >
              CANVAS
            </button>
            <button
              onClick={() => setActiveMobileTab("properties")}
              className={`flex-1 py-3 text-center text-[11px] font-mono font-bold uppercase tracking-widest transition-colors border-b-2 ${
                activeMobileTab === "properties"
                  ? "border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/5 font-black"
                  : "border-transparent text-stone-400 hover:text-stone-200"
              }`}
            >
              CALIBRATION
            </button>
          </div>

          {/* Main Studio Frame Layout */}
          <main className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 relative z-10 select-none">
            {/* Left column: Zone lists, quick parameters, SVG Upload / Raster Image tracer triggers */}
            <div className={`${activeMobileTab === "layers" ? "flex" : "hidden md:flex"} flex-col h-full shrink-0 w-full md:w-80`}>
              <ZoneListSidebar
                zones={zones}
                selectedZoneId={selectedZoneId}
                onSelectZone={setSelectedZoneId}
                zoneSettings={zoneSettings}
                onUploadSvg={handleSvgUpload}
                onSelectTemplate={loadTemplate}
                onOpenImageTracer={() => {
                  setDroppedImageFile(null);
                  setIsImageTracerOpen(true);
                }}
                onOpenColorTracer={() => {
                  setZones([]);
                  setZoneSettings({});
                  setSelectedZoneId(null);
                  setSvgContent(`<svg viewBox="0 0 400 400" width="100%" height="100%"><rect width="400" height="400" fill="transparent" /></svg>`);
                  setOriginalSvgContent(`<svg viewBox="0 0 400 400" width="100%" height="100%"><rect width="400" height="400" fill="transparent" /></svg>`);
                  setFileName("color-trace-workbook.svg");
                  setIsColorTracerOpen(true);
                }}
                hiddenZoneIds={hiddenZoneIds}
                onToggleZoneVisibility={handleToggleZoneVisibility}
                onRenameZone={handleRenameZone}
                onChangeZoneFrames={handleChangeZoneFrames}
              />
            </div>

            {/* Center column: Interactive SVG canvas viewport */}
            <div className={`${activeMobileTab === "canvas" ? "flex" : "hidden md:flex"} flex-1 flex-col p-3 md:p-4 bg-[#05080f] overflow-hidden`}>
              <SvgCanvas
                svgContent={svgContent}
                zones={zones}
                selectedZoneId={selectedZoneId}
                onSelectZone={(zoneId) => {
                  setSelectedZoneId(zoneId);
                  if (window.innerWidth < 768 && zoneId) {
                    // Instantly pivot viewport to calibration pane
                    setActiveMobileTab("properties");
                  }
                }}
                onOpenArtworkStudio={(zoneId) => {
                  setSelectedZoneId(zoneId);
                  setCurrentStage("artwork");
                  showStatus("Switched to Frame Artwork Studio for selected curve", "info");
                }}
                zoneSettings={zoneSettings}
                baseDocSize={baseDocSize}
                isSlicingPreviewActive={isSlicingPreviewActive}
                setIsSlicingPreviewActive={setIsSlicingPreviewActive}
                slicingPhase={slicingPhase}
                setSlicingPhase={setSlicingPhase}
                slicingScale={slicingScale}
                setSlicingScale={setSlicingScale}
                slicingMode={slicingMode}
                setSlicingMode={setSlicingMode}
                hiddenZoneIds={hiddenZoneIds}
                onOpenStitchedPreview={() => setIsStitchedPreviewOpen(true)}
                onUpdateZoneSettings={handleUpdateZoneSettings}
                onRenameZone={handleRenameZone}
                onChangeZoneFrames={handleChangeZoneFrames}
                onUpdateSvgContent={(newSvg) => {
                  setSvgContent(newSvg);
                  setOriginalSvgContent(newSvg);
                  showStatus("✓ Viewport framing baked into print viewBox!", "success");
                }}
                showStatus={showStatus}
              />
            </div>

            {/* Right column: Zone calibration attributes panel */}
            <div className={`${activeMobileTab === "properties" ? "flex" : "hidden md:flex"} h-full shrink-0 w-full md:w-80 lg:w-[340px]`}>
              <ZonePropertiesPanel
                selectedZoneSettings={selectedZoneId ? zoneSettings[selectedZoneId] : null}
                baseDocSize={baseDocSize}
                onUpdateSettings={handleUpdateZoneSettings}
                onRenameZone={handleRenameZone}
                onChangeZoneFrames={handleChangeZoneFrames}
                onResetToDefaultName={() => {
                  if (activeZoneInfo && selectedZoneId) {
                    handleUpdateZoneSettings({
                      ...zoneSettings[selectedZoneId],
                      zoneName: activeZoneInfo.defaultName,
                    });
                  }
                }}
                originalDefaultName={activeZoneInfo ? activeZoneInfo.defaultName : null}
                isSlicingPreviewActive={isSlicingPreviewActive}
                setIsSlicingPreviewActive={setIsSlicingPreviewActive}
                slicingPhase={slicingPhase}
                setSlicingPhase={setSlicingPhase}
                slicingScale={slicingScale}
                setSlicingScale={setSlicingScale}
                slicingMode={slicingMode}
                setSlicingMode={setSlicingMode}
                onExportSlices={handleExportSlices}
                onExportCricutSlices={handleExportCricutSlices}
                onOpenArtworkStudio={() => {
                  if (selectedZoneId) {
                    setCurrentStage("artwork");
                    showStatus("Switched to Frame Artwork Studio with recommended motion profile!", "info");
                  }
                }}
                showStatus={showStatus}
              />
            </div>
          </main>
        </>
      )}

      {/* Image Tracer Vectorizer Modal dialog */}
      <ImageTracerModal
        isOpen={isImageTracerOpen}
        onClose={() => {
          setIsImageTracerOpen(false);
          setDroppedImageFile(null);
        }}
        onVectorGenerated={handleVectorGenerated}
        showStatus={showStatus}
        initialImageFile={droppedImageFile}
      />

      {/* Color Magic-Wand Picker Vectorizer Modal dialog */}
      <ColorPickerTracerModal
        isOpen={isColorTracerOpen}
        onClose={() => setIsColorTracerOpen(false)}
        onAddTracedPath={handleAddTracedPath}
        onUpdateTracedPath={handleUpdateTracedPath}
        onRemoveTracedPath={handleRemoveTracedPath}
        showStatus={showStatus}
      />

      {/* Export Slices Preview Modal */}
      <ExportPreviewModal
        isOpen={isExportPreviewOpen}
        onClose={() => setIsExportPreviewOpen(false)}
        selectedZoneId={selectedZoneId}
        zoneSettings={zoneSettings}
        projectName={projectName}
        slicingScale={slicingScale}
        slicingPhase={slicingPhase}
        slicingMode={slicingMode}
        zones={zones}
        zoneArtworks={zoneArtworks}
        svgContent={svgContent}
        onSelectZone={setSelectedZoneId}
        onOpenArtworkStudio={() => {
          setIsExportPreviewOpen(false);
          setCurrentStage("artwork");
        }}
        onOpenStitchedPreview={() => {
          setIsExportPreviewOpen(false);
          setIsStitchedPreviewOpen(true);
        }}
        showStatus={showStatus}
      />

      {/* Stitched Artwork Frame-by-Frame Preview Modal */}
      <ErrorBoundary>
        <StitchedArtworkPreviewModal
          isOpen={isStitchedPreviewOpen}
          onClose={() => setIsStitchedPreviewOpen(false)}
          zones={zones}
          zoneSettings={zoneSettings}
          zoneArtworks={zoneArtworks}
          svgContent={svgContent}
          projectName={projectName}
          slicingScale={slicingScale}
          slicingPhase={slicingPhase}
          onSelectZone={setSelectedZoneId}
          onOpenArtworkStudio={(zoneId) => {
            setSelectedZoneId(zoneId);
            setIsStitchedPreviewOpen(false);
            setCurrentStage("artwork");
          }}
          showStatus={showStatus}
        />
      </ErrorBoundary>

      {/* Togglable Guide Instructions Modal */}
      {showWelcome && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-[#0c0c0c] border border-[#262626] rounded-none w-full max-w-lg overflow-hidden shadow-2xl">
            {/* Modal graphic header */}
            <div className="p-5 md:p-6 bg-black border-b border-[#262626] relative">
              <div className="flex items-center gap-2 mb-2">
                <span className="p-1 px-2 bg-black border border-[#262626] text-[#00f0ff] font-black text-[10px] font-mono tracking-widest">
                  [INTHE]
                </span>
                <span className="text-stone-500 font-mono tracking-widest text-[9px] uppercase font-bold">
                  VECTOR SPEC v1.1 // CORE MAPS
                </span>
              </div>
              <h2 className="text-base font-bold font-mono tracking-widest text-stone-100 uppercase">
                SCANIMATION & PARALLAX ENGINE
              </h2>
              <p className="text-stone-500 text-[10px] font-mono uppercase mt-1.5 leading-relaxed">
                Welcome to the professional physical editor for planning multi-directional parallax masks, printed motion slices, and traced raster curves.
              </p>
            </div>

            {/* Modal step-by-step points */}
            <div className="p-5 md:p-6 flex flex-col gap-4 max-h-[50vh] overflow-y-auto bg-[#0a0a0a]">
              <div className="flex gap-4">
                <div className="w-6 h-6 rounded bg-black border border-[#262626] flex items-center justify-center text-[#ff007f] font-mono font-bold shrink-0 text-[10px]">
                  01
                </div>
                <div>
                  <h4 className="font-bold text-[11px] font-mono uppercase text-stone-200 tracking-wide">Upload SVG or Trace Contours</h4>
                  <p className="text-stone-500 text-[10px] font-mono uppercase leading-relaxed mt-1">
                    Drag and drop SVG file or extract contours from PNG/JPG using our real-time 8-way pixel tracer.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-6 h-6 rounded bg-black border border-[#262626] flex items-center justify-center text-[#ff007f] font-mono font-bold shrink-0 text-[10px]">
                  02
                </div>
                <div>
                  <h4 className="font-bold text-[11px] font-mono uppercase text-stone-200 tracking-wide">Toggle / Layer Control</h4>
                  <p className="text-stone-500 text-[10px] font-mono uppercase leading-relaxed mt-1">
                    Mute/unmute active paths using the visibility eye toggle in the left list column to isolate geometries.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-6 h-6 rounded bg-black border border-[#262626] flex items-center justify-center text-[#ff007f] font-mono font-bold shrink-0 text-[10px]">
                  03
                </div>
                <div>
                  <h4 className="font-bold text-[11px] font-mono uppercase text-stone-200 tracking-wide">Establish Motion Vectors</h4>
                  <p className="text-stone-500 text-[10px] font-mono uppercase leading-relaxed mt-1">
                    Drag dynamic dials inside the calibration segment to control displacement angles (horizontal, vertical, diagonal).
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-6 h-6 rounded bg-black border border-[#262626] flex items-center justify-center text-[#ff007f] font-mono font-bold shrink-0 text-[10px]">
                  04
                </div>
                <div>
                  <h4 className="font-bold text-[11px] font-mono uppercase text-stone-200 tracking-wide">High-Contrast Grid Rendering</h4>
                  <p className="text-stone-500 text-[10px] font-mono uppercase leading-relaxed mt-1">
                    Monitor alignments on the real-time canvas styled with a dynamic pulsing industrial wire grid.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal dismiss action */}
            <div className="p-4 bg-black border-t border-[#262626] flex justify-end">
              <button
                onClick={() => setShowWelcome(false)}
                className="p-2 px-6 bg-[#00f0ff] hover:bg-[#00c8d6] active:scale-95 text-black font-black text-[10px] font-mono tracking-widest uppercase transition-colors flex items-center gap-1.5 cursor-pointer rounded"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Initialize Workspace</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
