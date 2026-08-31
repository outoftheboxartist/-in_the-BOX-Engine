/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ZoneArtwork, FrameArtwork, ZoneSettings, SVGZoneInfo } from "../types";
import { generateLinesData, clipLineToPolygon, getPolygonFromElement } from "./slicing";
import { drawSmoothStroke } from "./drawingSmoothing";

/**
 * Renders a single frame's artwork (drawing strokes + image/SVG) onto an HTML Canvas.
 */
export function renderFrameToCanvas(
  canvas: HTMLCanvasElement,
  frame: FrameArtwork | undefined,
  width: number,
  height: number,
  options?: {
    clipPolygon?: { x: number; y: number }[];
    backgroundColor?: string;
  }
): Promise<void> {
  return new Promise((resolve) => {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve();
      return;
    }

    ctx.clearRect(0, 0, width, height);

    if (options?.backgroundColor) {
      ctx.fillStyle = options.backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    // Apply polygon clipping if provided
    if (options?.clipPolygon && options.clipPolygon.length >= 3) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(options.clipPolygon[0].x, options.clipPolygon[0].y);
      for (let i = 1; i < options.clipPolygon.length; i++) {
        ctx.lineTo(options.clipPolygon[i].x, options.clipPolygon[i].y);
      }
      ctx.closePath();
      ctx.clip();
    }

    // 1. Draw Image / GIF frame if present
    const drawStrokesAndFinish = () => {
      // 2. Draw Vector Drawing Strokes
      if (frame?.strokes && frame.strokes.length > 0) {
        frame.strokes.forEach((stroke) => {
          if (stroke.points.length === 0) return;
          drawSmoothStroke(ctx, stroke);
        });
      }

      if (options?.clipPolygon && options.clipPolygon.length >= 3) {
        ctx.restore();
      }
      resolve();
    };

    if (frame?.imageDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.save();
        const transform = frame.imageTransform || { x: 0, y: 0, scale: 1, rotation: 0 };
        ctx.translate(width / 2 + transform.x, height / 2 + transform.y);
        ctx.rotate((transform.rotation * Math.PI) / 180);
        ctx.scale(transform.scale, transform.scale);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();

        drawStrokesAndFinish();
      };
      img.onerror = () => {
        drawStrokesAndFinish();
      };
      img.src = frame.imageDataUrl;
    } else {
      drawStrokesAndFinish();
    }
  });
}

/**
 * Creates an interleaved composite canvas of all frames for a single zone sliced by its vector angle.
 */
export async function createZoneSlicedCompositeCanvas(
  zoneArtwork: ZoneArtwork | undefined,
  settings: ZoneSettings,
  bbox: { x: number; y: number; width: number; height: number },
  clipPolygon: { x: number; y: number }[],
  scale: number,
  outputWidth: number,
  outputHeight: number
): Promise<HTMLCanvasElement> {
  const compositeCanvas = document.createElement("canvas");
  compositeCanvas.width = outputWidth;
  compositeCanvas.height = outputHeight;
  const compCtx = compositeCanvas.getContext("2d");
  if (!compCtx) return compositeCanvas;

  const frameCount = settings.frameCount || 6;
  const frames = zoneArtwork?.frames || [];

  // If no artwork frames exist, return empty canvas
  if (frames.length === 0) {
    return compositeCanvas;
  }

  // Pre-render each frame to its own canvas
  const frameCanvases: HTMLCanvasElement[] = [];
  for (let i = 0; i < frameCount; i++) {
    const fCanvas = document.createElement("canvas");
    const frameData = frames[i] || frames[0];
    await renderFrameToCanvas(fCanvas, frameData, outputWidth, outputHeight, {
      clipPolygon,
    });
    frameCanvases.push(fCanvas);
  }

  // Generate slice lines for each frame phase (phase = frameIndex / frameCount)
  for (let fIdx = 0; fIdx < frameCount; fIdx++) {
    const phase = fIdx / frameCount;
    const slicesData = generateLinesData(bbox, settings, scale, phase, false);
    const lineThickness = slicesData.lineThickness;

    // Clip each slice line to the polygon
    const clippedLines: typeof slicesData.lines = [];
    slicesData.lines.forEach((l) => {
      clippedLines.push(...clipLineToPolygon(l, clipPolygon));
    });

    if (clippedLines.length === 0) continue;

    // Create mask canvas for this frame's slice slits
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = outputWidth;
    maskCanvas.height = outputHeight;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) continue;

    maskCtx.strokeStyle = "#ffffff";
    maskCtx.lineWidth = lineThickness;
    maskCtx.lineCap = "butt";

    clippedLines.forEach((line) => {
      maskCtx.beginPath();
      maskCtx.moveTo(line.x1, line.y1);
      maskCtx.lineTo(line.x2, line.y2);
      maskCtx.stroke();
    });

    // Draw the frame canvas masked by the slice slits onto the composite canvas
    compCtx.save();
    const slicedFrameCanvas = document.createElement("canvas");
    slicedFrameCanvas.width = outputWidth;
    slicedFrameCanvas.height = outputHeight;
    const sfcCtx = slicedFrameCanvas.getContext("2d");
    if (sfcCtx) {
      sfcCtx.drawImage(frameCanvases[fIdx], 0, 0);
      sfcCtx.globalCompositeOperation = "destination-in";
      sfcCtx.drawImage(maskCanvas, 0, 0);
      compCtx.drawImage(slicedFrameCanvas, 0, 0);
    }
    compCtx.restore();
  }

  return compositeCanvas;
}
