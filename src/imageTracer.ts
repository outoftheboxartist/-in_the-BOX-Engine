/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculatePolygonOverlap } from "./utils/overlapTrimmer";

export interface Point {
  x: number;
  y: number;
}

/**
 * Traces an image and extracts its contours as closed SVG paths.
 * Uses connected component island segmentation and boundary extraction to ensure
 * extracted closed curves are clean, noise-free, and do not sit on top of each other.
 */
export function traceImageContours(
  canvas: HTMLCanvasElement,
  thresholdValue: number, // 0 - 255
  invert: boolean = false,
  simplifyTolerance: number = 2, // pixels distance
  trimOverlaps: boolean = true,
  minRegionPixels: number = 16
): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context from temporary canvas");

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // 1. Create a boolean grid of foreground pixels
  const grid = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Calculate perceived brightness / lightness
    // If alpha is transparent, treat as background
    let isForeground = false;
    if (a < 50) {
      isForeground = invert; // transparent is foreground if inverted
    } else {
      const lightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      isForeground = lightness < thresholdValue;
      if (invert) {
        isForeground = !isForeground;
      }
    }
    grid[i / 4] = isForeground ? 1 : 0;
  }

  // Moore-Neighbor 8-directions lookup clockwise
  const dirs: Point[] = [
    { x: 0, y: -1 },  // Up
    { x: 1, y: -1 },  // Up-Right
    { x: 1, y: 0 },   // Right
    { x: 1, y: 1 },   // Down-Right
    { x: 0, y: 1 },   // Down
    { x: -1, y: 1 },  // Down-Left
    { x: -1, y: 0 },  // Left
    { x: -1, y: -1 }, // Up-Left
  ];

  interface ContourCandidate {
    polygon: Point[];
    pathString: string;
    area: number;
  }

  const candidates: ContourCandidate[] = [];

  if (trimOverlaps) {
    // 2. Connected Component Island Partitioning
    // We group matching foreground pixels into independent 4-connected components.
    // Each component is traced independently so internal holes or duplicate concentric boundaries
    // do NOT create curves sitting on top of each other.
    const visited = new Uint8Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const startIdx = x + y * width;
        if (grid[startIdx] === 1 && visited[startIdx] === 0) {
          // BFS to collect all pixels of this island
          const queue: number[] = [startIdx];
          visited[startIdx] = 1;
          const islandPixels: number[] = [startIdx];
          let topY = y;
          let leftX = x;
          let firstX = x;
          let firstY = y;

          let head = 0;
          while (head < queue.length) {
            const curr = queue[head++];
            const cx = curr % width;
            const cy = Math.floor(curr / width);

            // Update top-left reference
            if (cy < topY || (cy === topY && cx < leftX)) {
              topY = cy;
              leftX = cx;
              firstX = cx;
              firstY = cy;
            }

            const neighbors = [
              { nx: cx + 1, ny: cy },
              { nx: cx - 1, ny: cy },
              { nx: cx, ny: cy + 1 },
              { nx: cx, ny: cy - 1 },
            ];

            for (const n of neighbors) {
              if (n.nx >= 0 && n.nx < width && n.ny >= 0 && n.ny < height) {
                const nIdx = n.nx + n.ny * width;
                if (grid[nIdx] === 1 && visited[nIdx] === 0) {
                  visited[nIdx] = 1;
                  queue.push(nIdx);
                  islandPixels.push(nIdx);
                }
              }
            }
          }

          // Discard tiny speckle noise
          if (islandPixels.length < minRegionPixels) {
            continue;
          }

          // Create an isolated binary grid for this specific island
          const islandGrid = new Uint8Array(width * height);
          for (const pIdx of islandPixels) {
            islandGrid[pIdx] = 1;
          }

          // Trace the outer boundary of this isolated island
          const islandVisited = new Uint8Array(width * height);
          const contour = traceContour(firstX, firstY, islandGrid, width, height, dirs, islandVisited);
          if (contour && contour.length > 3) {
            const simplified = simplifyContourRDP(contour, simplifyTolerance);
            if (simplified.length > 2) {
              candidates.push({
                polygon: simplified,
                pathString: pointsToSvgPath(simplified),
                area: islandPixels.length,
              });
            }
          }
        }
      }
    }

    // 3. Post-process candidate polygons to trim any nested, contained, or heavily overlapping curves
    const keptCandidates: ContourCandidate[] = [];
    // Sort by area descending so primary dominant curves are evaluated first
    candidates.sort((a, b) => b.area - a.area);

    for (let i = 0; i < candidates.length; i++) {
      const candA = candidates[i];
      let overlapsExisting = false;

      for (let j = 0; j < keptCandidates.length; j++) {
        const candB = keptCandidates[j];
        const { overlapA, overlapB } = calculatePolygonOverlap(candA.polygon, candB.polygon);

        // If candidate A is mostly inside or heavily overlapping with an already kept larger curve B
        if (overlapA > 0.35 || overlapB > 0.35) {
          overlapsExisting = true;
          break;
        }
      }

      if (!overlapsExisting) {
        keptCandidates.push(candA);
      }
    }

    const paths = keptCandidates.map((c) => c.pathString);

    // Assemble full SVG document
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
  <rect width="${width}" height="${height}" fill="transparent" />
  <g fill="#10b981" fill-opacity="0.8" stroke="#ffffff" stroke-width="2" stroke-linejoin="round">
    ${paths.join("\n    ")}
  </g>
</svg>`;
  } else {
    // Legacy Moore-Neighbor scan
    const visitedRightBorders = new Uint8Array(width * height);
    const paths: string[] = [];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = x + y * width;
        if (grid[idx] === 1 && grid[idx - 1] === 0 && visitedRightBorders[idx] === 0) {
          const contour = traceContour(x, y, grid, width, height, dirs, visitedRightBorders);
          if (contour && contour.length > 3) {
            const simplified = simplifyContourRDP(contour, simplifyTolerance);
            if (simplified.length > 2) {
              paths.push(pointsToSvgPath(simplified));
            }
          }
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
  <rect width="${width}" height="${height}" fill="transparent" />
  <g fill="#10b981" fill-opacity="0.8" stroke="#ffffff" stroke-width="2" stroke-linejoin="round">
    ${paths.join("\n    ")}
  </g>
</svg>`;
  }
}

/**
 * Traces a single contour loop using Moore-Neighbor algorithm.
 */
function traceContour(
  startX: number,
  startY: number,
  grid: Uint8Array,
  width: number,
  height: number,
  dirs: Point[],
  visitedBorders: Uint8Array
): Point[] {
  const points: Point[] = [];
  let cx = startX;
  let cy = startY;

  // Let's start with previous background cell to the left
  let backDirIndex = 6; // Left index (points to x - 1)

  // Max iterations guarding against infinite loops
  const maxIterations = width * height * 2;
  let iterations = 0;

  let firstTransition: string | null = null;

  while (iterations < maxIterations) {
    iterations++;
    
    // Find the next active pixel by scanning neighbors clockwise starting from backDirIndex
    let foundNext = false;
    let nextX = cx;
    let nextY = cy;
    let foundDirIdx = -1;

    for (let i = 0; i < 8; i++) {
      const checkIdx = (backDirIndex + i) % 8;
      const d = dirs[checkIdx];
      const tx = cx + d.x;
      const ty = cy + d.y;

      if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
        if (grid[tx + ty * width] === 1) {
          nextX = tx;
          nextY = ty;
          foundDirIdx = checkIdx;
          foundNext = true;
          break;
        }
      }
    }

    if (!foundNext) {
      // Isolated pixel
      points.push({ x: cx, y: cy });
      break;
    }

    // Mark transit lines
    visitedBorders[cx + cy * width] = 1;

    // Check loop termination: returned to start point with same entry angle
    const transitionKey = `${cx},${cy}->${nextX},${nextY}`;
    if (firstTransition === null) {
      firstTransition = transitionKey;
    } else if (transitionKey === firstTransition) {
      break;
    }

    points.push({ x: cx, y: cy });

    // Pivot update: set backDirIndex to preceding index in direction check (opposite/backtracked)
    // To scan clockwise next time from where we came
    cx = nextX;
    cy = nextY;
    backDirIndex = (foundDirIdx + 5) % 8; // Turn 225 degrees counter-clockwise
  }

  return points;
}

/**
 * Ramer-Douglas-Peucker (RDP) algorithm for line curve simplification.
 * Smooths out marching square rugged pixels into smooth geometric edges.
 */
function simplifyContourRDP(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;

  let maxSqDist = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const sqDist = getSqSegmentDist(points[i], points[0], points[end]);
    if (sqDist > maxSqDist) {
      index = i;
      maxSqDist = sqDist;
    }
  }

  if (maxSqDist > tolerance * tolerance) {
    const results1 = simplifyContourRDP(points.slice(0, index + 1), tolerance);
    const results2 = simplifyContourRDP(points.slice(index), tolerance);
    return results1.slice(0, results1.length - 1).concat(results2);
  }

  return [points[0], points[end]];
}

/**
 * Squared perpendicular distance from segment or point.
 */
function getSqSegmentDist(p: Point, p1: Point, p2: Point): number {
  let x = p1.x;
  let y = p1.y;
  let dx = p2.x - x;
  let dy = p2.y - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2.x;
      y = p2.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = p.x - x;
  dy = p.y - y;

  return dx * dx + dy * dy;
}

/**
 * High contrast SVG formatting generator.
 */
function pointsToSvgPath(points: Point[]): string {
  if (points.length < 2) return "";
  const commands = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
  return `<path d="${commands.join(" ")} Z" />`;
}

function pointsToSvgPathData(points: Point[]): string {
  if (points.length < 2) return "";
  const commands = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
  return `${commands.join(" ")} Z`;
}

/**
 * Traces all contours matching a specific target color within a tolerance range.
 * Returns the d-attribute data for a compound SVG path.
 */
export function traceImageColorRegion(
  canvas: HTMLCanvasElement,
  targetColor: { r: number; g: number; b: number },
  tolerance: number,
  simplifyTolerance: number = 2.0
): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context from temporary canvas");

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Create a boolean grid where pixel match criteria is satisfied
  const grid = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 50) {
      grid[i / 4] = 0; // Skip transparent
      continue;
    }

    // Euclidean distance in RGB color space
    const dist = Math.sqrt(
      (r - targetColor.r) ** 2 +
      (g - targetColor.g) ** 2 +
      (b - targetColor.b) ** 2
    );

    grid[i / 4] = dist <= tolerance ? 1 : 0;
  }

  // Moore-Neighbor 8-directions lookup clockwise
  const dirs: Point[] = [
    { x: 0, y: -1 },  // Up
    { x: 1, y: -1 },  // Up-Right
    { x: 1, y: 0 },   // Right
    { x: 1, y: 1 },   // Down-Right
    { x: 0, y: 1 },   // Down
    { x: -1, y: 1 },  // Down-Left
    { x: -1, y: 0 },  // Left
    { x: -1, y: -1 }, // Up-Left
  ];

  const visitedRightBorders = new Uint8Array(width * height);
  const pathSegments: string[] = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = x + y * width;
      if (grid[idx] === 1 && grid[idx - 1] === 0 && visitedRightBorders[idx] === 0) {
        const contour = traceContour(x, y, grid, width, height, dirs, visitedRightBorders);
        if (contour && contour.length > 3) {
          const simplified = simplifyContourRDP(contour, simplifyTolerance);
          if (simplified.length > 2) {
            const pathData = pointsToSvgPathData(simplified);
            if (pathData) {
              pathSegments.push(pathData);
            }
          }
        }
      }
    }
  }

  return pathSegments.join(" ");
}

/**
 * Maps RGB coordinates to their closest recognized literal human label.
 */
export function getClosestColorName(r: number, g: number, b: number): string {
  const colorNames: { name: string; r: number; g: number; b: number }[] = [
    { name: "Red", r: 255, g: 0, b: 0 },
    { name: "Deep Crimson", r: 180, g: 0, b: 30 },
    { name: "Coral Rose", r: 240, g: 100, b: 100 },
    { name: "Orange", r: 255, g: 127, b: 0 },
    { name: "Amber Gold", r: 255, g: 191, b: 0 },
    { name: "Yellow", r: 255, g: 255, b: 0 },
    { name: "Lime Green", r: 127, g: 255, b: 0 },
    { name: "Emerald Green", r: 0, g: 200, b: 80 },
    { name: "Forest Green", r: 34, g: 139, b: 34 },
    { name: "Teal Blue", r: 0, g: 128, b: 128 },
    { name: "Cyan", r: 0, g: 255, b: 255 },
    { name: "Sky Blue", r: 135, g: 206, b: 250 },
    { name: "Royal Blue", r: 30, g: 144, b: 255 },
    { name: "Midnight Blue", r: 25, g: 25, b: 112 },
    { name: "Indigo Violet", r: 75, g: 0, b: 130 },
    { name: "Lavender Purple", r: 230, g: 190, b: 255 },
    { name: "Magenta Pink", r: 255, g: 0, b: 255 },
    { name: "Hot Pink", r: 255, g: 105, b: 180 },
    { name: "Plum Wine", r: 128, g: 0, b: 128 },
    { name: "Salmon Pink", r: 250, g: 128, b: 114 },
    { name: "Sandy Brown", r: 244, g: 164, b: 96 },
    { name: "Chocolate Brown", r: 139, g: 69, b: 19 },
    { name: "Charcoal Slate", r: 47, g: 79, b: 79 },
    { name: "Cool Silver", r: 192, g: 192, b: 192 },
    { name: "Pure White", r: 255, g: 255, b: 255 },
    { name: "Off White", r: 245, g: 245, b: 245 },
    { name: "Pitch Black", r: 0, g: 0, b: 0 },
    { name: "Dark Charcoal", r: 30, g: 30, b: 30 }
  ];

  let minDistance = Infinity;
  let closestColorName = "Custom Color";

  for (const color of colorNames) {
    const dist = Math.sqrt(
      (r - color.r) ** 2 +
      (g - color.g) ** 2 +
      (b - color.b) ** 2
    );
    if (dist < minDistance) {
      minDistance = dist;
      closestColorName = color.name;
    }
  }

  return closestColorName;
}

/**
 * Traces a single connected component (island) containing (clickX, clickY) of matching pixels.
 * Supports a global mask to avoid re-clicking or re-tracing already claimed islands.
 */
export function traceClickedColorIsland(
  canvas: HTMLCanvasElement,
  clickX: number,
  clickY: number,
  targetColor: { r: number; g: number; b: number },
  tolerance: number,
  globalMask: Uint8Array, // Size width * height
  simplifyTolerance: number = 2.0
): {
  pathD: string;
  colorHex: string;
  colorName: string;
  islandPixelIndices: number[];
} | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context from temporary canvas");

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // 1. Build matching grid for all unmasked pixels matching target color
  const grid = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const idx = i / 4;
    
    // Check if pixel is already claimed/masked out
    if (globalMask && globalMask[idx] === 1) {
      grid[idx] = 0;
      continue;
    }

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 50) {
      grid[idx] = 0; // Skip transparent
      continue;
    }

    // Euclidean distance in RGB color space
    const dist = Math.sqrt(
      (r - targetColor.r) ** 2 +
      (g - targetColor.g) ** 2 +
      (b - targetColor.b) ** 2
    );

    grid[idx] = dist <= tolerance ? 1 : 0;
  }

  // 2. Find closest valid starting point matching the criteria near (clickX, clickY)
  let startX = Math.floor(clickX);
  let startY = Math.floor(clickY);
  let foundStart = false;

  // Let's do a spiral or radial search up to 12 pixels out to make clicking friendly and robust
  const searchRadius = 12;
  outerLoop:
  for (let r = 0; r <= searchRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // Only process the outer ring of radius r
        const tx = startX + dx;
        const ty = startY + dy;
        if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
          const idx = tx + ty * width;
          if (grid[idx] === 1) {
            startX = tx;
            startY = ty;
            foundStart = true;
            break outerLoop;
          }
        }
      }
    }
  }

  if (!foundStart) {
    return null;
  }

  // 3. Find connected component of matched pixels using BFS starting at (startX, startY)
  const component = new Uint8Array(width * height);
  const queue: number[] = [];
  const startIdx = startX + startY * width;
  
  component[startIdx] = 1;
  queue.push(startIdx);

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const cx = idx % width;
    const cy = Math.floor(idx / width);

    // 4-way connectivity to prevent diagonal bleeding across separate regions
    const neighbors = [
      { x: cx + 1, y: cy },
      { x: cx - 1, y: cy },
      { x: cx, y: cy + 1 },
      { x: cx, y: cy - 1 }
    ];

    for (const n of neighbors) {
      if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
        const nIdx = n.x + n.y * width;
        if (grid[nIdx] === 1 && component[nIdx] === 0) {
          component[nIdx] = 1;
          queue.push(nIdx);
        }
      }
    }
  }

  // 4. Trace the boundary of this specific isolated component
  const dirs: Point[] = [
    { x: 0, y: -1 },  // Up
    { x: 1, y: -1 },  // Up-Right
    { x: 1, y: 0 },   // Right
    { x: 1, y: 1 },   // Down-Right
    { x: 0, y: 1 },   // Down
    { x: -1, y: 1 },  // Down-Left
    { x: -1, y: 0 },  // Left
    { x: -1, y: -1 }, // Up-Left
  ];

  const visitedRightBorders = new Uint8Array(width * height);
  const pathSegments: string[] = [];

  // Search for the starting edge of our isolated component
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = x + y * width;
      if (component[idx] === 1 && component[idx - 1] === 0 && visitedRightBorders[idx] === 0) {
        const contour = traceContour(x, y, component, width, height, dirs, visitedRightBorders);
        if (contour && contour.length > 3) {
          const simplified = simplifyContourRDP(contour, simplifyTolerance);
          if (simplified.length > 2) {
            const pathData = pointsToSvgPathData(simplified);
            if (pathData) {
              pathSegments.push(pathData);
              break;
            }
          }
        }
      }
    }
    if (pathSegments.length > 0) {
      break;
    }
  }

  if (pathSegments.length === 0) {
    return null;
  }

  // Gather list of pixel indices belonging to this island
  const islandPixelIndices: number[] = [];
  for (let i = 0; i < component.length; i++) {
    if (component[i] === 1) {
      islandPixelIndices.push(i);
    }
  }

  // Read clicked pixel exact color for literal hex naming
  const pixelIdx4 = startIdx * 4;
  const clickR = data[pixelIdx4];
  const clickG = data[pixelIdx4 + 1];
  const clickB = data[pixelIdx4 + 2];
  
  const toHexStr = (x: number) => {
    const h = x.toString(16);
    return h.length === 1 ? "0" + h : h;
  };
  const colorHex = `#${toHexStr(clickR)}${toHexStr(clickG)}${toHexStr(clickB)}`.toUpperCase();
  const colorName = getClosestColorName(clickR, clickG, clickB);

  return {
    pathD: pathSegments.join(" "),
    colorHex,
    colorName,
    islandPixelIndices
  };
}
