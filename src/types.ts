/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Vector2D {
  dx: number;
  dy: number;
  angle: number; // in degrees: 0 is Right, 90 is Down, 180 is Left, 270 is Up
}

export interface ZoneSettings {
  zoneId: string; // The generated unique identifier, matches data-zone-id
  tagName: string; // e.g. path, rect, circle, polygon etc.
  originalId: string | null; // The id from the original SVG (if any)
  zoneName: string;
  frameCount: number; // e.g. 6
  windowWidth: number; // mm, e.g. 1.0
  revealDirection: Vector2D;
  notes: string;
  isSolid?: boolean; // When true, replaces multi-frame animation logic with a solid static layer
  solidColor?: string; // Color for solid fill (e.g. #000000, #ffffff, #ff007f)
}

export interface SVGZoneInfo {
  id: string; // matches data-zone-id
  tagName: string;
  originalId: string | null;
  defaultName: string;
}

export interface DrawPoint {
  x: number;
  y: number;
}

export interface DrawStroke {
  id: string;
  points: DrawPoint[];
  color: string;
  width: number;
  isEraser?: boolean;
}

export interface ImageTransform {
  x: number;
  y: number;
  scale: number;
  scaleX?: number; // horizontal width scale multiplier (1.0 = 100%)
  scaleY?: number; // vertical height scale multiplier (1.0 = 100%)
  rotation: number;
}

export interface FrameArtwork {
  frameIndex: number;
  strokes: DrawStroke[];
  imageDataUrl?: string; // Uploaded raster image or trimmed GIF frame
  svgSnippet?: string; // Custom SVG snippet or vector shapes
  imageTransform?: ImageTransform;
  notes?: string;
}

export interface ZoneArtwork {
  zoneId: string;
  frames: FrameArtwork[];
  activeFrameIndex: number;
  onionSkinning?: boolean;
  onionSkinOpacity?: number;
}

export type StopMotionFrames = Record<number, DrawStroke[]>;

export interface BaseDocSize {
  widthInches: number;
  heightInches: number;
  label: string;
  unit: "in" | "mm";
}

export interface ProjectData {
  projectName: string;
  fileName: string;
  svgContent: string; // The full instrumented SVG string
  originalSvgContent: string; // The original uploaded SVG string
  zones: SVGZoneInfo[];
  settings: Record<string, ZoneSettings>; // key is zoneId
  artworks?: Record<string, ZoneArtwork>; // key is zoneId
  baseDocSize?: BaseDocSize;
  updatedAt: string;
}


