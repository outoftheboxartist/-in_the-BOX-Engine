/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseGIF, decompressFrames } from "gifuct-js";

export interface DecodedGifResult {
  frames: {
    dataUrl: string;
    delay: number;
    frameNumber: number;
  }[];
  width: number;
  height: number;
  totalDurationMs: number;
}

/**
 * Decodes an animated GIF ArrayBuffer into individual frame PNG data URLs.
 */
export async function decodeGifFromBuffer(arrayBuffer: ArrayBuffer): Promise<DecodedGifResult> {
  try {
    const gif = parseGIF(arrayBuffer);
    const parsedFrames = decompressFrames(gif, true);

    if (!parsedFrames || parsedFrames.length === 0) {
      throw new Error("No valid frames detected in GIF file.");
    }

    const width = gif.lsd?.width || 400;
    const height = gif.lsd?.height || 300;

    // Master accumulation canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Could not initialize 2D canvas context.");
    }

    // Temporary patch canvas
    const patchCanvas = document.createElement("canvas");
    const patchCtx = patchCanvas.getContext("2d", { willReadFrequently: true });
    if (!patchCtx) {
      throw new Error("Could not initialize patch canvas context.");
    }

    const framesOut: { dataUrl: string; delay: number; frameNumber: number }[] = [];
    let totalDurationMs = 0;

    // Previous frame image data for disposalType 3 (restore previous)
    let previousImageData: ImageData | null = null;

    for (let i = 0; i < parsedFrames.length; i++) {
      const frame = parsedFrames[i];
      const delay = frame.delay || 100; // standard 100ms default
      totalDurationMs += delay;

      // Save previous state if disposal method is restore
      if (frame.disposalType === 3) {
        previousImageData = ctx.getImageData(0, 0, width, height);
      }

      // Set patch canvas dimensions
      patchCanvas.width = frame.dims.width;
      patchCanvas.height = frame.dims.height;
      const patchImgData = new ImageData(
        new Uint8ClampedArray(frame.patch),
        frame.dims.width,
        frame.dims.height
      );
      patchCtx.putImageData(patchImgData, 0, 0);

      // Draw patch to master canvas
      ctx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);

      // Capture current frame composite
      framesOut.push({
        dataUrl: canvas.toDataURL("image/png"),
        delay,
        frameNumber: i + 1,
      });

      // Handle disposal methods
      if (frame.disposalType === 2) {
        // Clear to transparent / background
        ctx.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height);
      } else if (frame.disposalType === 3 && previousImageData) {
        // Restore previous state
        ctx.putImageData(previousImageData, 0, 0);
      }
    }

    return {
      frames: framesOut,
      width,
      height,
      totalDurationMs,
    };
  } catch (err) {
    console.warn("Failed to parse GIF with gifuct-js, attempting fallback rasterization:", err);
    // Create a single dummy frame
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#111118";
      ctx.fillRect(0, 0, 400, 300);
      ctx.fillStyle = "#00f0ff";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Animation Frame", 200, 150);
    }
    const fallbackUrl = canvas.toDataURL("image/png");
    return {
      frames: [{ dataUrl: fallbackUrl, delay: 100, frameNumber: 1 }],
      width: 400,
      height: 300,
      totalDurationMs: 100,
    };
  }
}

/**
 * Decodes an animated GIF file into individual frame PNG data URLs.
 */
export async function decodeGifFile(file: File): Promise<DecodedGifResult> {
  const arrayBuffer = await file.arrayBuffer();
  return decodeGifFromBuffer(arrayBuffer);
}

/**
 * Fetches and decodes an animated GIF from a direct URL or data URI,
 * with comprehensive fallback for CORS restrictions and network hiccups.
 */
export async function decodeGifFromUrl(url: string): Promise<DecodedGifResult> {
  // 1. Try direct fetch and buffer parse
  try {
    const res = await fetch(url, { mode: "cors" });
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const decoded = await decodeGifFromBuffer(arrayBuffer);
      if (decoded.frames.length > 0) {
        return decoded;
      }
    }
  } catch (err) {
    console.warn("Direct fetch for GIF failed, trying image element fallback:", err);
  }

  // 2. Fallback: load into HTML Image element (bypasses some CORS binary restrictions for drawing)
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve(); // continue even on error
      img.src = url;
    });

    const width = img.naturalWidth || 400;
    const height = img.naturalHeight || 300;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/png");
      return {
        frames: [{ dataUrl, delay: 100, frameNumber: 1 }],
        width,
        height,
        totalDurationMs: 100,
      };
    }
  } catch (imgErr) {
    console.warn("Image fallback failed:", imgErr);
  }

  // 3. Ultra-safe placeholder canvas fallback (never crashes)
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#0c1018";
    ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = "#00f0ff";
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Animation Cycle", 200, 150);
  }
  const fallbackUrl = canvas.toDataURL("image/png");
  return {
    frames: [{ dataUrl: fallbackUrl, delay: 100, frameNumber: 1 }],
    width: 400,
    height: 300,
    totalDurationMs: 100,
  };
}

/**
 * Resamples or trims an array of frame data URLs to match an exact target frame count.
 * @param frames List of decoded frame data URLs
 * @param targetCount Number of frames needed (e.g. curve frameCount = 6)
 * @param range Optional [startIndex, endIndex] 0-indexed bounds
 */
export function resampleGifFrames(
  frames: string[],
  targetCount: number,
  range?: [number, number]
): string[] {
  if (frames.length === 0 || targetCount <= 0) return [];

  const start = range ? Math.max(0, Math.min(range[0], frames.length - 1)) : 0;
  const end = range ? Math.max(start, Math.min(range[1], frames.length - 1)) : frames.length - 1;

  const subset = frames.slice(start, end + 1);
  if (subset.length === 0) return [];

  if (subset.length === targetCount) {
    return subset;
  }

  const result: string[] = [];
  if (targetCount === 1) {
    return [subset[0]];
  }

  for (let i = 0; i < targetCount; i++) {
    // Linear step across the range
    const t = i / (targetCount - 1);
    const index = Math.round(t * (subset.length - 1));
    result.push(subset[Math.min(index, subset.length - 1)]);
  }

  return result;
}
