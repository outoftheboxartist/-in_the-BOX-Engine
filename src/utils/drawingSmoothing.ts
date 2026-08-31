/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from "react";
import { DrawPoint, DrawStroke } from "../types";

/**
 * Extracts high-density pointer samples from raw hardware coalesced events
 * and interpolates gaps to eliminate straight/segmented drawing artifacts.
 */
export function extractSampledPoints(
  e: React.PointerEvent<HTMLCanvasElement>,
  activeViewBox: { x: number; y: number; width: number; height: number },
  canvasRect: DOMRect
): DrawPoint[] {
  const rectW = Math.max(1, canvasRect.width);
  const rectH = Math.max(1, canvasRect.height);

  const toSvgCoords = (clientX: number, clientY: number): DrawPoint => {
    const normX = Math.max(0, Math.min(1, (clientX - canvasRect.left) / rectW));
    const normY = Math.max(0, Math.min(1, (clientY - canvasRect.top) / rectH));
    return {
      x: activeViewBox.x + normX * activeViewBox.width,
      y: activeViewBox.y + normY * activeViewBox.height,
    };
  };

  const rawPoints: DrawPoint[] = [];

  // 1. Extract sub-frame hardware coalesced events if available
  const nativeEv = e.nativeEvent as PointerEvent;
  if (nativeEv && typeof nativeEv.getCoalescedEvents === "function") {
    try {
      const coalesced = nativeEv.getCoalescedEvents();
      if (coalesced && coalesced.length > 0) {
        for (let i = 0; i < coalesced.length; i++) {
          rawPoints.push(toSvgCoords(coalesced[i].clientX, coalesced[i].clientY));
        }
      }
    } catch {
      // Fallback if browser security sandbox restricts coalesced events
    }
  }

  // Fallback to standard event if no coalesced events were extracted
  if (rawPoints.length === 0) {
    rawPoints.push(toSvgCoords(e.clientX, e.clientY));
  }

  return rawPoints;
}

/**
 * Subdivides large distance gaps between sequential points to ensure dense, smooth paths.
 */
export function densifyPoints(points: DrawPoint[], maxDistance = 3.0): DrawPoint[] {
  if (points.length < 2) return points;

  const result: DrawPoint[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const p0 = result[result.length - 1];
    const p1 = points[i];

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.hypot(dx, dy);

    if (dist > maxDistance) {
      const steps = Math.ceil(dist / maxDistance);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        result.push({
          x: p0.x + dx * t,
          y: p0.y + dy * t,
        });
      }
    }
    result.push(p1);
  }

  return result;
}

/**
 * Renders a stroke onto a 2D Canvas context using smooth Midpoint Quadratic Bezier Splines.
 * This completely eliminates straight-edge angular segmentation.
 */
export function drawSmoothStroke(
  ctx: CanvasRenderingContext2D,
  stroke: DrawStroke | { points: DrawPoint[]; color?: string; width?: number; isEraser?: boolean }
) {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return;

  ctx.save();

  if (stroke.isEraser) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.fillStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.color || "#00f0ff";
    ctx.fillStyle = stroke.color || "#00f0ff";
  }

  const w = stroke.width || 4;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Single point dot / stamp
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // 2 points: simple line segment
  if (pts.length === 2) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // 3+ points: Quadratic Bezier Curve through midpoints
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }

  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.stroke();
  ctx.restore();
}
