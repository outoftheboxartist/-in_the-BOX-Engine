/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ZoneSettings, Vector2D } from "../types";
import { getPolygonFromElement, getBoundingBoxFromPolygon } from "./slicing";

export interface ShapeMetrics {
  pathLength: number; // in pixels
  perimeter: number; // in pixels
  bbox: { x: number; y: number; width: number; height: number };
  aspectRatio: number; // width / height
  aspectType: "horizontal" | "vertical" | "equilateral" | "diagonal" | "serpentine";
  principalAngle: number; // in degrees (0 = horizontal, 90 = vertical, 45 = diagonal)
  roundness: number; // 0.0 to 1.0 (1.0 = perfect circle)
  sinuosity: number; // path length / bounding diagonal (>1.5 is very sinuous/curved)
  area: number;
  isClosed: boolean;
  tagName: string;
}

export interface CreatureMotionArchetype {
  id: string;
  name: string;
  category: "quadruped" | "birds" | "aquatic" | "humanoid" | "mechanical" | "celestial" | "serpentine" | "organic" | "custom";
  badge: string;
  iconName: string;
  summary: string;
  whyItWorks: string; // Optical physics explanation of why this creature maximizes scanimation "wow" factor
  contrastLevel: "high" | "ultra"; // Indicates extreme optical contrast between subject and background
  bwOptimized: boolean; // Pure solid black & white silhouette
  tags: string[]; // Search tags (e.g. 'silhouette', 'loop', 'cricut', 'high-contrast', 'bw')
  gifPreviewUrl?: string; // Small animated preview thumbnail
  gifUrl?: string; // Full quality animated GIF for direct 1-click slicing
  gifTitle?: string;
  recommendedSettings: {
    revealDirection: Vector2D;
    frameCount: number;
    windowWidth: number;
    slicingMode: "bars" | "cutting";
  };
  frameChoreography: {
    frameIndex: number;
    phaseName: string;
    description: string;
    motionCue: string;
  }[];
  suitabilityScore: number; // 0 to 100
  suitabilityReasons: string[];
}

export interface MotionAnalysisResult {
  metrics: ShapeMetrics;
  currentAlignmentScore: number; // 0 to 100% how well current zone settings match optimal physics
  currentAlignmentFeedback: string;
  primaryRecommendation: CreatureMotionArchetype;
  allRecommendations: CreatureMotionArchetype[];
}

/**
 * Creates high-contrast animated SVG data URI fallbacks for pure black & white scanimation previews.
 */
function createBwSilhouetteSvgDataUrl(type: string): string {
  let innerSvg = "";
  if (type === "horse") {
    // Muybridge running horse silhouette loop
    innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="200" height="120">
      <rect width="200" height="120" fill="#0d1117"/>
      <path fill="#ffffff" d="M30 65 Q45 50 70 52 Q90 55 110 50 Q130 42 150 48 Q165 52 175 42 Q170 60 155 68 Q140 70 125 68 Q115 80 100 85 Q90 95 80 82 Q70 85 55 80 Q40 85 30 65 Z">
        <animate attributeName="d" dur="0.8s" repeatCount="indefinite" values="
          M30 65 Q45 50 70 52 Q90 55 110 50 Q130 42 150 48 Q165 52 175 42 Q170 60 155 68 Q140 70 125 68 Q115 80 100 85 Q90 95 80 82 Q70 85 55 80 Q40 85 30 65 Z;
          M25 60 Q40 45 65 48 Q85 50 105 45 Q125 40 145 44 Q160 48 170 38 Q165 56 150 64 Q135 68 120 75 Q110 90 95 90 Q85 92 75 78 Q65 82 50 78 Q35 80 25 60 Z;
          M35 70 Q50 55 75 56 Q95 60 115 55 Q135 46 155 52 Q170 58 180 46 Q175 64 160 72 Q145 74 130 70 Q120 75 105 80 Q95 98 85 86 Q75 88 60 84 Q45 90 35 70 Z;
          M30 65 Q45 50 70 52 Q90 55 110 50 Q130 42 150 48 Q165 52 175 42 Q170 60 155 68 Q140 70 125 68 Q115 80 100 85 Q90 95 80 82 Q70 85 55 80 Q40 85 30 65 Z
        "/>
      </path>
    </svg>`;
  } else if (type === "bird") {
    // Soaring falcon wings
    innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120">
      <rect width="160" height="120" fill="#0d1117"/>
      <path fill="#ffffff" d="M80 60 Q60 40 20 45 Q50 65 80 70 Q110 65 140 45 Q100 40 80 60 Z">
        <animate attributeName="d" dur="0.7s" repeatCount="indefinite" values="
          M80 60 Q60 20 15 15 Q45 55 80 68 Q115 55 145 15 Q100 20 80 60 Z;
          M80 60 Q60 50 20 60 Q50 70 80 70 Q110 70 140 60 Q100 50 80 60 Z;
          M80 60 Q60 80 25 105 Q55 85 80 72 Q105 85 135 105 Q100 80 80 60 Z;
          M80 60 Q60 50 20 60 Q50 70 80 70 Q110 70 140 60 Q100 50 80 60 Z;
          M80 60 Q60 20 15 15 Q45 55 80 68 Q115 55 145 15 Q100 20 80 60 Z
        "/>
      </path>
    </svg>`;
  } else if (type === "gear") {
    // Rotating gear / optical cogwheel
    innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <rect width="120" height="120" fill="#0d1117"/>
      <g transform="translate(60,60)">
        <path fill="#ffffff" d="M-10,-45 L10,-45 L12,-35 L32,-32 L40,-20 L30,-12 L35,10 L45,15 L45,-10 L45,10 L35,32 L20,40 L12,30 L-10,45 L-12,35 L-32,32 L-40,20 L-30,12 L-35,-10 L-45,-15 L-35,-32 L-20,-40 Z"/>
        <circle r="18" fill="#0d1117"/>
        <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`;
  } else if (type === "wave") {
    // Sinuous traveling harmonic wave
    innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 100" width="180" height="100">
      <rect width="180" height="100" fill="#0d1117"/>
      <path fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" d="M10 50 Q 50 15, 90 50 T 170 50">
        <animate attributeName="d" dur="1s" repeatCount="indefinite" values="
          M10 50 Q 50 15, 90 50 T 170 50;
          M10 50 Q 50 85, 90 50 T 170 50;
          M10 50 Q 50 15, 90 50 T 170 50
        "/>
      </path>
    </svg>`;
  } else {
    // Default high-contrast pulsing starburst / optical wheel
    innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <rect width="120" height="120" fill="#0d1117"/>
      <g transform="translate(60,60)">
        <circle r="36" fill="#ffffff">
          <animate attributeName="r" values="18;40;18" dur="1.2s" repeatCount="indefinite"/>
        </circle>
        <circle r="10" fill="#0d1117"/>
      </g>
    </svg>`;
  }

  return `data:image/svg+xml;utf8,${encodeURIComponent(innerSvg)}`;
}

/**
 * Calculates second central moments / covariance of polygon vertices
 * to determine the principal orientation axis.
 */
function calculatePrincipalOrientation(poly: { x: number; y: number }[]): {
  angleDeg: number;
  eccentricity: number;
} {
  if (poly.length < 3) {
    return { angleDeg: 0, eccentricity: 0 };
  }

  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p.x;
    cy += p.y;
  }
  cx /= poly.length;
  cy /= poly.length;

  let u20 = 0;
  let u02 = 0;
  let u11 = 0;

  for (const p of poly) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    u20 += dx * dx;
    u02 += dy * dy;
    u11 += dx * dy;
  }

  // Orientation angle of principal inertia axis
  let angleRad = 0.5 * Math.atan2(2 * u11, u20 - u02);
  let angleDeg = (angleRad * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 180;

  // Calculate eccentricity
  const lambda1 = 0.5 * (u20 + u02 + Math.sqrt((u20 - u02) ** 2 + 4 * u11 ** 2));
  const lambda2 = 0.5 * (u20 + u02 - Math.sqrt((u20 - u02) ** 2 + 4 * u11 ** 2));
  const eccentricity = lambda1 > 0 ? Math.sqrt(1 - lambda2 / lambda1) : 0;

  return { angleDeg: Math.round(angleDeg), eccentricity: parseFloat(eccentricity.toFixed(2)) };
}

/**
 * Calculates the Shoelace polygon area.
 */
function calculatePolygonArea(poly: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y;
    area -= poly[j].x * poly[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Measures the total perimeter or path sample length of a polygon.
 */
function calculatePolygonPerimeter(poly: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const dx = poly[j].x - poly[i].x;
    const dy = poly[j].y - poly[i].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

/**
 * Analyzes raw SVG element and extracts geometric descriptors:
 * length, aspect ratio, orientation, curvature, roundness, and sinuosity.
 */
export function analyzeShapeGeometry(
  el: SVGElement | null,
  currentSettings?: ZoneSettings
): ShapeMetrics {
  if (!el) {
    return {
      pathLength: 200,
      perimeter: 200,
      bbox: { x: 0, y: 0, width: 100, height: 100 },
      aspectRatio: 1.0,
      aspectType: "equilateral",
      principalAngle: 0,
      roundness: 0.8,
      sinuosity: 1.0,
      area: 10000,
      isClosed: true,
      tagName: "shape",
    };
  }

  const tagName = el.tagName.toLowerCase();
  const polygon = getPolygonFromElement(el, true);
  const bbox = getBoundingBoxFromPolygon(polygon);

  let pathLength = 0;
  if (tagName === "path" && typeof (el as unknown as SVGPathElement).getTotalLength === "function") {
    try {
      pathLength = (el as unknown as SVGPathElement).getTotalLength();
    } catch {
      pathLength = calculatePolygonPerimeter(polygon);
    }
  } else {
    pathLength = calculatePolygonPerimeter(polygon);
  }

  const perimeter = calculatePolygonPerimeter(polygon);
  const area = calculatePolygonArea(polygon);
  const diag = Math.sqrt(bbox.width * bbox.width + bbox.height * bbox.height);
  const sinuosity = diag > 0 ? pathLength / diag : 1.0;

  // Roundness (isoperimetric quotient = 4 * PI * Area / Perimeter^2)
  const roundness = perimeter > 0 ? Math.min(1.0, (4 * Math.PI * area) / (perimeter * perimeter)) : 0;

  // Aspect ratio
  const aspectRatio = bbox.height > 0 ? bbox.width / bbox.height : 1.0;

  // Principal Angle
  const { angleDeg } = calculatePrincipalOrientation(polygon);

  let aspectType: "horizontal" | "vertical" | "equilateral" | "diagonal" | "serpentine" = "equilateral";
  if (sinuosity > 1.7) {
    aspectType = "serpentine";
  } else if (aspectRatio > 1.45) {
    aspectType = "horizontal";
  } else if (aspectRatio < 0.68) {
    aspectType = "vertical";
  } else if (Math.abs(angleDeg - 45) < 22 || Math.abs(angleDeg - 135) < 22) {
    aspectType = "diagonal";
  } else {
    aspectType = "equilateral";
  }

  return {
    pathLength: Math.round(pathLength),
    perimeter: Math.round(perimeter),
    bbox,
    aspectRatio: parseFloat(aspectRatio.toFixed(2)),
    aspectType,
    principalAngle: Math.round(angleDeg),
    roundness: parseFloat(roundness.toFixed(2)),
    sinuosity: parseFloat(sinuosity.toFixed(2)),
    area: Math.round(area),
    isClosed: tagName !== "polyline" && tagName !== "line",
    tagName,
  };
}

/**
 * Comprehensive database of Solid, Simple, High-Contrast Black & White
 * Motion Archetypes engineered for Physical Barrier-Grid Scanimation.
 */
export const ARCHETYPE_DATABASE: Omit<CreatureMotionArchetype, "suitabilityScore" | "suitabilityReasons">[] = [
  // 1. Quadruped / Animals (Solid B&W Silhouettes)
  {
    id: "galloping-horse",
    name: "Galloping Black Stallion (Muybridge)",
    category: "quadruped",
    badge: "B&W Scanimation Classic",
    iconName: "Zap",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["horse", "stallion", "gallop", "run", "quadruped", "animal", "muybridge", "silhouette", "bw", "high-contrast"],
    summary: "Solid black stallion silhouette in rotary gallop stride with high-contrast leg separation.",
    whyItWorks:
      "Eadweard Muybridge's legendary horse silhouette is the gold standard of barrier-grid scanimation. Solid black silhouettes on white backgrounds eliminate all halftone noise, rendering crisp leg arcs through the slit grid.",
    gifPreviewUrl: "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/200w.gif",
    gifUrl: "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif",
    gifTitle: "Solid B&W Galloping Horse",
    recommendedSettings: {
      revealDirection: { dx: 1, dy: 0, angle: 0 },
      frameCount: 8,
      windowWidth: 1.2,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Hind Gathering", description: "Black silhouette spine flexed; hind hooves gathered.", motionCue: "Compact black silhouette." },
      { frameIndex: 1, phaseName: "Hind Propulsion", description: "Hind legs extend back; forelegs tuck.", motionCue: "Hindlegs extending straight back." },
      { frameIndex: 2, phaseName: "Airborne Reach", description: "Forelegs stretch forward; body suspended.", motionCue: "Maximum horizontal span." },
      { frameIndex: 3, phaseName: "Foreleg Plant", description: "Front hoof impacts ground line.", motionCue: "Front leg vertical under shoulder." },
      { frameIndex: 4, phaseName: "Torso Roll", description: "Body rolls over planted front leg.", motionCue: "Shoulders dip, rump rises." },
      { frameIndex: 5, phaseName: "Hind Coil", description: "Hindquarters gather for next stride.", motionCue: "Smooth reset to Frame 1." },
    ],
  },
  {
    id: "prowling-panther",
    name: "Prowling Panther / Big Cat Stride",
    category: "quadruped",
    badge: "Solid Black Silhouette",
    iconName: "Zap",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["cat", "panther", "tiger", "quadruped", "animal", "walk", "stalk", "prowl", "silhouette", "bw", "high-contrast"],
    summary: "Sleek low-slung black panther silhouette walking with fluid shoulder oscillation and tail whip.",
    whyItWorks:
      "Solid black feline silhouettes have smooth continuous contour changes. As the horizontal grating moves at 0°, the legs and spine glide with zero strobing flicker.",
    gifPreviewUrl: "https://media.giphy.com/media/l41lO3zS2m0kQoEak/200w.gif",
    gifUrl: "https://media.giphy.com/media/l41lO3zS2m0kQoEak/giphy.gif",
    gifTitle: "Solid B&W Panther Walk",
    recommendedSettings: {
      revealDirection: { dx: 1, dy: 0, angle: 0 },
      frameCount: 6,
      windowWidth: 1.15,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Left Step Contact", description: "Left front paw touches ground line.", motionCue: "Front left step." },
      { frameIndex: 1, phaseName: "Torso Deflection", description: "Body shifts weight smoothly right.", motionCue: "Lateral deflection." },
      { frameIndex: 2, phaseName: "Right Paw Reach", description: "Right forepaw reaches forward.", motionCue: "Leading paw extended." },
      { frameIndex: 3, phaseName: "Right Step Contact", description: "Right paw plants; rear leg lifts.", motionCue: "Front right step." },
      { frameIndex: 4, phaseName: "Tail Balance Whip", description: "Tail curls upward for counter-balance.", motionCue: "Tail whip up." },
      { frameIndex: 5, phaseName: "Stride Reset", description: "Legs realign ready to loop.", motionCue: "Cycle reset." },
    ],
  },
  {
    id: "cheetah-sprint",
    name: "Sprinting Cheetah High-Speed Bound",
    category: "quadruped",
    badge: "High Velocity Stride",
    iconName: "Zap",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["cheetah", "sprint", "run", "fast", "quadruped", "animal", "silhouette", "bw"],
    summary: "Maximum elongation and spine flexion of a sprinting cheetah at full speed.",
    whyItWorks:
      "Wide elongation factors provide extreme visual displacement across consecutive barrier slits.",
    gifPreviewUrl: "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/200w.gif",
    gifUrl: "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif",
    gifTitle: "Solid B&W Cheetah Sprint",
    recommendedSettings: {
      revealDirection: { dx: 1, dy: 0, angle: 0 },
      frameCount: 8,
      windowWidth: 1.2,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Coiled Spine", description: "Spine bowed; feet tucked under chest.", motionCue: "Coiled burst." },
      { frameIndex: 1, phaseName: "Launch Extension", description: "Rear legs push off.", motionCue: "Extending rear." },
      { frameIndex: 2, phaseName: "Fully Extended Reach", description: "Forelegs reaching extreme forward point.", motionCue: "Full stretch." },
      { frameIndex: 3, phaseName: "Ground Impact", description: "Front paws strike and absorb shock.", motionCue: "Forelegs plant." },
      { frameIndex: 4, phaseName: "Spine Gathering", description: "Hips whip forward over shoulders.", motionCue: "Rapid compression." },
      { frameIndex: 5, phaseName: "Flight Reset", description: "Airborne suspension ready to loop.", motionCue: "Loop reset." },
    ],
  },

  // 2. Humanoid & Biped
  {
    id: "walking-man",
    name: "Classic Walking Man Silhouette",
    category: "humanoid",
    badge: "Muybridge B&W Human",
    iconName: "Activity",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["human", "walking", "man", "stride", "humanoid", "biped", "locomotion", "muybridge", "silhouette", "bw"],
    summary: "Iconic high-contrast bipedal walking cycle with arm swing and stride phase alternation.",
    whyItWorks:
      "Human locomotion is instantly recognizable to the human eye. High-contrast solid black limbs against white space produce a remarkably crisp optical walking effect through the slits.",
    gifPreviewUrl: createBwSilhouetteSvgDataUrl("horse"),
    gifUrl: "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif",
    gifTitle: "Solid B&W Walking Human",
    recommendedSettings: {
      revealDirection: { dx: 1, dy: 0, angle: 0 },
      frameCount: 8,
      windowWidth: 1.2,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Contact Phase L", description: "Left heel strikes; right arm swings forward.", motionCue: "Heel strike." },
      { frameIndex: 1, phaseName: "Mid-Stance L", description: "Weight passes over left leg.", motionCue: "Body vertical." },
      { frameIndex: 2, phaseName: "Push-Off L", description: "Left toe pushes; right leg swings forward.", motionCue: "Toe push." },
      { frameIndex: 3, phaseName: "Contact Phase R", description: "Right heel strikes; left arm swings forward.", motionCue: "Opposite heel strike." },
      { frameIndex: 4, phaseName: "Mid-Stance R", description: "Weight passes over right leg.", motionCue: "Body vertical." },
      { frameIndex: 5, phaseName: "Push-Off R", description: "Right toe pushes off to loop back.", motionCue: "Loop reset." },
    ],
  },

  // 3. Birds & Flight
  {
    id: "vertical-butterfly",
    name: "Fluttering Butterfly Silhouette",
    category: "birds",
    badge: "High-Frequency B&W Flap",
    iconName: "Bug",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["butterfly", "moth", "wings", "flutter", "birds", "aerial", "flight", "silhouette", "bw"],
    summary: "Solid black butterfly wings clapping open and shut in rapid vertical flutter.",
    whyItWorks:
      "Vertical elongated shapes combined with vertical 90° barrier lines yield the highest strobing frequency in barrier-grid animation. The stark solid wing silhouette ensures 100% optical opacity.",
    gifPreviewUrl: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200w.gif",
    gifUrl: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
    gifTitle: "Solid B&W Butterfly Wings",
    recommendedSettings: {
      revealDirection: { dx: 0, dy: 1, angle: 90 },
      frameCount: 6,
      windowWidth: 1.0,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Wings Vertical Up", description: "Wings elevated high above thorax in sharp V.", motionCue: "Wings pointing steeply upward." },
      { frameIndex: 1, phaseName: "Mid-Downstroke", description: "Wings sweep horizontally outward with broad profile.", motionCue: "Wings extend wide." },
      { frameIndex: 2, phaseName: "Lowest Downstroke", description: "Wings cupped downwards beneath body.", motionCue: "Wings pointing down." },
      { frameIndex: 3, phaseName: "Upstroke Snap", description: "Narrow wing profiles slicing upward.", motionCue: "Thin edge profile." },
      { frameIndex: 4, phaseName: "Late Recovery", description: "Trailing edges fold toward dorsal axis.", motionCue: "Wings folding inwards." },
      { frameIndex: 5, phaseName: "Pre-Apex Reset", description: "Wings meet at apex ready to repeat.", motionCue: "Loop reset." },
    ],
  },
  {
    id: "soaring-falcon",
    name: "Soaring Eagle / Falcon Silhouette",
    category: "birds",
    badge: "Solid B&W Raptor Arc",
    iconName: "Compass",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["bird", "eagle", "falcon", "hawk", "wings", "glide", "birds", "aerial", "flight", "silhouette", "bw"],
    summary: "High-contrast eagle silhouette with broad primary feathers banking and diving diagonally.",
    whyItWorks:
      "Diagonal 45° barrier lines matching the bird's banking angle produce a dramatic sense of depth, speed, and soaring flight.",
    gifPreviewUrl: "https://media.giphy.com/media/3o7TKtnuHOH6Ix2SMo/200w.gif",
    gifUrl: "https://media.giphy.com/media/3o7TKtnuHOH6Ix2SMo/giphy.gif",
    gifTitle: "Solid B&W Soaring Falcon",
    recommendedSettings: {
      revealDirection: { dx: 0.707, dy: 0.707, angle: 45 },
      frameCount: 6,
      windowWidth: 1.15,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Wings Wide Spread", description: "Broad thermal soaring posture.", motionCue: "Full wingspan silhouette." },
      { frameIndex: 1, phaseName: "Banking Turn Roll", description: "One wing lowers to initiate steep dive.", motionCue: "Asymmetric bank angle." },
      { frameIndex: 2, phaseName: "Tucked Bullet Stoop", description: "Wings pulled tight into aerodynamic bullet.", motionCue: "Compact dive shape." },
      { frameIndex: 3, phaseName: "Apex Speed Strike", description: "Talons swing forward beneath body.", motionCue: "Strike posture." },
      { frameIndex: 4, phaseName: "Flare Air-Braking", description: "Wings snap open into cupped fan.", motionCue: "Wide drag profile." },
      { frameIndex: 5, phaseName: "Updraft Climb", description: "Wings sweep up catching thermal loop.", motionCue: "Climbing angle." },
    ],
  },
  {
    id: "flapping-bat",
    name: "Silhouette Flapping Bat",
    category: "birds",
    badge: "Solid B&W Membrane Wings",
    iconName: "Bug",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["bat", "wings", "birds", "aerial", "night", "gothic", "halloween", "silhouette", "bw", "high-contrast"],
    summary: "Crisp black webbed bat membrane wings flapping with sharp finger joint articulation.",
    whyItWorks:
      "Webbed membrane silhouettes produce pure opaque black shapes, ensuring 100% transmission contrast across fine slit gratings.",
    gifPreviewUrl: "https://media.giphy.com/media/3oriO04qxVReM5rJEA/200w.gif",
    gifUrl: "https://media.giphy.com/media/3oriO04qxVReM5rJEA/giphy.gif",
    gifTitle: "Solid B&W Flapping Bat",
    recommendedSettings: {
      revealDirection: { dx: 0, dy: 1, angle: 90 },
      frameCount: 6,
      windowWidth: 1.0,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Wings Spread Wide", description: "Elongated finger bones extend membrane.", motionCue: "Maximum wing reach." },
      { frameIndex: 1, phaseName: "Downstroke Scoop", description: "Wings cup forward and down.", motionCue: "Downward curve." },
      { frameIndex: 2, phaseName: "Lower Clench", description: "Wing tips almost touch below belly.", motionCue: "Deep downward cup." },
      { frameIndex: 3, phaseName: "Folded Recovery", description: "Elbows tuck close to ribcage.", motionCue: "Narrow torso profile." },
      { frameIndex: 4, phaseName: "Upward Thrust", description: "Wrists lead upward snap.", motionCue: "Elevated wing joints." },
      { frameIndex: 5, phaseName: "Apex Unfurl", description: "Membrane snaps taut at top of stroke.", motionCue: "Ready for next flap." },
    ],
  },

  // 4. Marine & Aquatic
  {
    id: "swimming-koi",
    name: "Swimming Koi / Shark Silhouette",
    category: "aquatic",
    badge: "Solid B&W Undulation",
    iconName: "Fish",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["fish", "koi", "shark", "swim", "water", "marine", "aquatic", "silhouette", "bw", "high-contrast"],
    summary: "Solid black marine spine undulation with rhythmic caudal fin sweeps and tail flutter.",
    whyItWorks:
      "Horizontal elongated paths allow horizontal barrier-grid slits to resolve smooth, progressive wave ripples along the spine with zero optical clipping artifacts.",
    gifPreviewUrl: "https://media.giphy.com/media/l41JRsph73VokN6ik/200w.gif",
    gifUrl: "https://media.giphy.com/media/l41JRsph73VokN6ik/giphy.gif",
    gifTitle: "Solid B&W Swimming Fish",
    recommendedSettings: {
      revealDirection: { dx: 1, dy: 0, angle: 0 },
      frameCount: 6,
      windowWidth: 1.2,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Neutral Drift", description: "Spine centered; tail slightly curved left.", motionCue: "Straight spine." },
      { frameIndex: 1, phaseName: "Left Power Stroke", description: "Spine curves right; caudal fin snaps hard left.", motionCue: "Tail flex left." },
      { frameIndex: 2, phaseName: "Mid Transition", description: "Tail passes through center axis.", motionCue: "Center glide." },
      { frameIndex: 3, phaseName: "Right Power Stroke", description: "Spine curves left; caudal fin snaps hard right.", motionCue: "Tail flex right." },
      { frameIndex: 4, phaseName: "Elastic Return", description: "Momentum carries tail back toward midline.", motionCue: "Return to center." },
      { frameIndex: 5, phaseName: "Gliding Reset", description: "Body straightens ready to loop.", motionCue: "Loop reset." },
    ],
  },
  {
    id: "pulsing-jellyfish",
    name: "Pulsing Deep-Sea Jellyfish",
    category: "aquatic",
    badge: "Vertical B&W Hydrostatic Pulse",
    iconName: "Compass",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["jellyfish", "medusa", "pulse", "ocean", "aquatic", "marine", "tentacles", "silhouette", "bw"],
    summary: "Solid dome contraction squeezing water downward with flowing trailing tentacles.",
    whyItWorks:
      "Vertical slit barriers capture the bell expanding outward and squeezing tight, creating a hypnotic stroboscopic swimming rhythm.",
    gifPreviewUrl: "https://media.giphy.com/media/l0HlNzJUVZ5zrHikE/200w.gif",
    gifUrl: "https://media.giphy.com/media/l0HlNzJUVZ5zrHikE/giphy.gif",
    gifTitle: "Solid B&W Pulsing Jellyfish",
    recommendedSettings: {
      revealDirection: { dx: 0, dy: 1, angle: 90 },
      frameCount: 6,
      windowWidth: 1.0,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Relaxed Bell", description: "Bell dome wide; tentacles hang straight.", motionCue: "Wide flattened dome." },
      { frameIndex: 1, phaseName: "Pre-Contraction", description: "Bell margin flares outward.", motionCue: "Widest bell diameter." },
      { frameIndex: 2, phaseName: "Power Squeeze", description: "Bell muscles contract forcing water jet.", motionCue: "Compressed bell shape." },
      { frameIndex: 3, phaseName: "Upward Surge", description: "Apex surges upward; tentacles stream tight.", motionCue: "Surging upward dome." },
      { frameIndex: 4, phaseName: "Deceleration", description: "Bell begins elastic expansion.", motionCue: "Expanding bell." },
      { frameIndex: 5, phaseName: "Buoyancy Reset", description: "Resting state ready to re-ignite pulse.", motionCue: "Loop baseline." },
    ],
  },

  // 5. Mechanical & Wheels
  {
    id: "rotating-cogwheel",
    name: "Industrial Cogwheel / Gear Spin",
    category: "mechanical",
    badge: "Precision B&W Mechanical Torque",
    iconName: "RotateCcw",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["gear", "cog", "turbine", "spin", "rotate", "mechanical", "wheels", "industrial", "clockwork", "bw", "silhouette"],
    summary: "Solid high-contrast gear teeth spinning with continuous 360° stroboscopic angular velocity.",
    whyItWorks:
      "Equilateral / circular shapes with radial symmetry transform linear barrier motion into perpetual mechanical torque, delivering a mesmerizing machine animation.",
    gifPreviewUrl: createBwSilhouetteSvgDataUrl("gear"),
    gifUrl: "https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif",
    gifTitle: "Solid B&W Rotating Gear",
    recommendedSettings: {
      revealDirection: { dx: 1, dy: 0, angle: 0 },
      frameCount: 6,
      windowWidth: 1.1,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Key Tooth at 12:00 (0°)", description: "Primary gear tooth aligned at 12 o'clock apex.", motionCue: "Tooth at top." },
      { frameIndex: 1, phaseName: "Rotation +60°", description: "Gear advances clockwise by 60°.", motionCue: "Tooth at 2 o'clock." },
      { frameIndex: 2, phaseName: "Rotation +120°", description: "Gear advances to 4 o'clock position.", motionCue: "Tooth at bottom-right." },
      { frameIndex: 3, phaseName: "Rotation +180°", description: "Gear at 6 o'clock bottom dead center.", motionCue: "Tooth at bottom." },
      { frameIndex: 4, phaseName: "Rotation +240°", description: "Gear advances to 8 o'clock position.", motionCue: "Tooth at bottom-left." },
      { frameIndex: 5, phaseName: "Rotation +300°", description: "Gear advances to 10 o'clock to loop.", motionCue: "Return to 12 o'clock." },
    ],
  },
  {
    id: "locomotive-piston",
    name: "Steam Engine Piston & Connecting Rod",
    category: "mechanical",
    badge: "Reciprocating Piston Loop",
    iconName: "RotateCcw",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["piston", "engine", "locomotive", "mechanical", "wheels", "train", "industrial", "bw", "silhouette"],
    summary: "Solid black crank connecting rod turning linear reciprocating force into wheel rotation.",
    whyItWorks:
      "Horizontal linear translation paired with wheel rotation creates strong mechanical rhythm through barrier slats.",
    gifPreviewUrl: createBwSilhouetteSvgDataUrl("gear"),
    gifUrl: "https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif",
    gifTitle: "Solid B&W Locomotive Crank",
    recommendedSettings: {
      revealDirection: { dx: 1, dy: 0, angle: 0 },
      frameCount: 6,
      windowWidth: 1.2,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Left Dead Center", description: "Piston fully retracted left.", motionCue: "Crank at 9 o'clock." },
      { frameIndex: 1, phaseName: "Mid Stroke Forward", description: "Crank swings high across top apex.", motionCue: "Crank at 12 o'clock." },
      { frameIndex: 2, phaseName: "Right Dead Center", description: "Piston fully extended right.", motionCue: "Crank at 3 o'clock." },
      { frameIndex: 3, phaseName: "Return Under-Stroke", description: "Crank dips low through bottom arc.", motionCue: "Crank at 6 o'clock." },
      { frameIndex: 4, phaseName: "Pre-Compression", description: "Piston approaches starting chamber.", motionCue: "Crank at 8 o'clock." },
      { frameIndex: 5, phaseName: "Stroke Reset", description: "Cycle completes 360° rotation.", motionCue: "Loop reset." },
    ],
  },

  // 6. Celestial & Radial
  {
    id: "hypnotic-spiral",
    name: "Hypnotic Vortex Spiral",
    category: "celestial",
    badge: "Solid B&W Infinity Tunnel",
    iconName: "RotateCcw",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["spiral", "vortex", "hypnotic", "celestial", "radial", "illusion", "optical", "portal", "tunnel", "bw", "silhouette"],
    summary: "Solid concentric Archimedean spiral arms spinning inward into infinite optical depth.",
    whyItWorks:
      "High-contrast black spiral arms intersecting linear grating lines trigger the famous Barber-pole / Moire illusion, giving the illusion of perpetual 3D zooming.",
    gifPreviewUrl: createBwSilhouetteSvgDataUrl("star"),
    gifUrl: "https://media.giphy.com/media/26AHONQ79FdWZhAI0/giphy.gif",
    gifTitle: "Solid B&W Hypnotic Spiral",
    recommendedSettings: {
      revealDirection: { dx: 1, dy: 0, angle: 0 },
      frameCount: 6,
      windowWidth: 1.2,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Spiral Phase 0°", description: "Spiral arms originate at cardinal coordinates.", motionCue: "Starting spiral curve." },
      { frameIndex: 1, phaseName: "Spiral Phase +60°", description: "Arms advance clockwise, contracting toward center.", motionCue: "Inward rotation." },
      { frameIndex: 2, phaseName: "Spiral Phase +120°", description: "Core density concentrates.", motionCue: "Deep vortex center." },
      { frameIndex: 3, phaseName: "Spiral Phase +180°", description: "Inverted arm symmetry.", motionCue: "Balanced optical illusion." },
      { frameIndex: 4, phaseName: "Spiral Phase +240°", description: "Outer edges draw new arms into view.", motionCue: "Continuous expansion." },
      { frameIndex: 5, phaseName: "Spiral Phase +300°", description: "Arms realign seamlessly with Frame 1.", motionCue: "Seamless infinity loop." },
    ],
  },
  {
    id: "pulsing-starburst",
    name: "Pulsing Optical Starburst / Radial Rays",
    category: "celestial",
    badge: "Solid B&W Strobe Rays",
    iconName: "Sparkles",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["star", "starburst", "sparkle", "celestial", "radial", "sunburst", "supernova", "burst", "bw", "silhouette"],
    summary: "Solid high-contrast radial rays expanding outwards from core followed by stroboscopic contraction.",
    whyItWorks:
      "Radial ray geometry creates alternating transmission bands across the grating, producing sharp optical bursts and breathing luminance.",
    gifPreviewUrl: createBwSilhouetteSvgDataUrl("star"),
    gifUrl: "https://media.giphy.com/media/l0HlNzJUVZ5zrHikE/giphy.gif",
    gifTitle: "Solid B&W Optical Starburst",
    recommendedSettings: {
      revealDirection: { dx: 1, dy: 0, angle: 0 },
      frameCount: 6,
      windowWidth: 1.1,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Condensed Core", description: "Small dense center circle with stubby rays.", motionCue: "Small dense core." },
      { frameIndex: 1, phaseName: "Corona Expansion", description: "Core expands; primary cardinal rays shoot outward.", motionCue: "Ray flare outward." },
      { frameIndex: 2, phaseName: "Maximum Supernova", description: "All rays reach maximum perimeter boundary.", motionCue: "Full radial reach." },
      { frameIndex: 3, phaseName: "Shockwave Ring", description: "Center core shrinks; outer ring drifts.", motionCue: "Hollow shockwave." },
      { frameIndex: 4, phaseName: "Gravitational Recoil", description: "Particles collapse back toward center.", motionCue: "Inward energy streaks." },
      { frameIndex: 5, phaseName: "Pre-Ignition Reset", description: "Core compresses ready for next burst.", motionCue: "Tight compact circle." },
    ],
  },

  // 7. Waves & Serpentine
  {
    id: "sinuous-harmonic-wave",
    name: "Harmonic Sine Ribbon / Wave",
    category: "serpentine",
    badge: "Solid B&W Traveling Wave",
    iconName: "Activity",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["wave", "sine", "ribbon", "serpentine", "serpent", "harmonic", "fluid", "undulate", "bw", "silhouette"],
    summary: "Solid high-contrast traveling sine wave ribbon propagating smoothly across the curve.",
    whyItWorks:
      "Curved serpentine paths allow transverse wave crests and troughs to 'travel' continuously in a perpetual fluid loop without any jarring seam cuts.",
    gifPreviewUrl: createBwSilhouetteSvgDataUrl("wave"),
    gifUrl: "https://media.giphy.com/media/3o7btUg31RQUBKxAOx/giphy.gif",
    gifTitle: "Solid B&W Sinuous Wave",
    recommendedSettings: {
      revealDirection: { dx: 1, dy: 0, angle: 0 },
      frameCount: 8,
      windowWidth: 1.2,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Wave Crest Alpha", description: "Wave peak positioned at 25% curve length.", motionCue: "Primary wave crest." },
      { frameIndex: 1, phaseName: "Wave Advance +1/8λ", description: "Crest shifts forward along spine by 12.5%.", motionCue: "Shift wave peaks right." },
      { frameIndex: 2, phaseName: "Wave Advance +2/8λ", description: "Crest shifts to 50% midpoint of curve.", motionCue: "Midpoint crest peak." },
      { frameIndex: 3, phaseName: "Wave Advance +3/8λ", description: "Crest advances to 62.5% length.", motionCue: "Wave energy shifting." },
      { frameIndex: 4, phaseName: "Wave Inversion Phase", description: "Opposite harmonic peak emerges at start.", motionCue: "Invert curvature." },
      { frameIndex: 5, phaseName: "Wave Advance +5/8λ", description: "New crest advances along anterior body.", motionCue: "Continuous translation." },
      { frameIndex: 6, phaseName: "Wave Advance +6/8λ", description: "Crest reaches 75% body length.", motionCue: "Posterior peak flex." },
      { frameIndex: 7, phaseName: "Loop Completion", description: "Tail tip snaps off energy; head realigns to loop.", motionCue: "Seamless loop transition." },
    ],
  },

  // 8. Organic & Botanical
  {
    id: "beating-heart",
    name: "Beating Heart Silhouette Pulse",
    category: "organic",
    badge: "Solid B&W Systole Vitality",
    iconName: "Sparkles",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["heart", "pulse", "beat", "love", "vitality", "organic", "silhouette", "bw"],
    summary: "Solid black anatomical heart expanding with explosive systolic surge and relaxed recoil.",
    whyItWorks:
      "High-contrast solid black heart silhouettes expanding and contracting through the slit barrier create a visceral, lifelike heartbeat animation.",
    gifPreviewUrl: "https://media.giphy.com/media/l41lI4bYmcsPJX9Go/200w.gif",
    gifUrl: "https://media.giphy.com/media/l41lI4bYmcsPJX9Go/giphy.gif",
    gifTitle: "Solid B&W Beating Heart",
    recommendedSettings: {
      revealDirection: { dx: 1, dy: 0, angle: 0 },
      frameCount: 6,
      windowWidth: 1.1,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Diastolic Rest", description: "Heart at baseline resting volume.", motionCue: "Medium compact silhouette." },
      { frameIndex: 1, phaseName: "Pre-Systolic Swell", description: "Ventricles fill with surge.", motionCue: "Expanded lateral lobes." },
      { frameIndex: 2, phaseName: "Maximum Burst", description: "Heart reaches peak explosive expansion.", motionCue: "Largest heart silhouette." },
      { frameIndex: 3, phaseName: "Ventricular Squeeze", description: "Muscles clench tight, squeezing inward.", motionCue: "Smallest concentrated silhouette." },
      { frameIndex: 4, phaseName: "Elastic Rebound", description: "Walls relax back outward.", motionCue: "Expanding contours." },
      { frameIndex: 5, phaseName: "Baseline Reset", description: "Settles to resting state ready to beat again.", motionCue: "Frame 1 match." },
    ],
  },
  {
    id: "blooming-lotus",
    name: "Blooming Lotus Petal Expansion",
    category: "organic",
    badge: "Solid B&W Floral Unfurl",
    iconName: "Sparkles",
    contrastLevel: "ultra",
    bwOptimized: true,
    tags: ["flower", "lotus", "bloom", "blossom", "nature", "botanical", "petals", "organic", "bw", "silhouette"],
    summary: "Concentric floral petal silhouettes unfolding vertically from closed bud into radiant blossom.",
    whyItWorks:
      "Layered petal silhouettes unfolding vertically produce a magical time-lapse growth sensation through the barrier grid with crisp black & white contrast.",
    gifPreviewUrl: createBwSilhouetteSvgDataUrl("star"),
    gifUrl: "https://media.giphy.com/media/l0HlNzJUVZ5zrHikE/giphy.gif",
    gifTitle: "Solid B&W Blooming Flower",
    recommendedSettings: {
      revealDirection: { dx: 0, dy: 1, angle: 90 },
      frameCount: 6,
      windowWidth: 1.0,
      slicingMode: "bars",
    },
    frameChoreography: [
      { frameIndex: 0, phaseName: "Closed Bud", description: "Petals wrapped tightly in conical bud.", motionCue: "Compact vertical teardrop." },
      { frameIndex: 1, phaseName: "Outer Sepal Peel", description: "Outer petals flare outward.", motionCue: "Base petals spreading wide." },
      { frameIndex: 2, phaseName: "Middle Ring Unfurl", description: "Middle tier reveals inner core.", motionCue: "Cup-shaped blossom." },
      { frameIndex: 3, phaseName: "Full Radiance", description: "All petals fully expanded.", motionCue: "Widest blossom diameter." },
      { frameIndex: 4, phaseName: "Gentle Sway", description: "Petals settle in ambient air.", motionCue: "Subtle relaxation." },
      { frameIndex: 5, phaseName: "Re-closing Reset", description: "Petals fold back to bud to loop.", motionCue: "Return to compact shape." },
    ],
  },
];

/**
 * Filters and searches archetypes by query, category, and contrast requirements.
 */
export function filterArchetypes(
  archetypes: CreatureMotionArchetype[],
  query = "",
  category = "all",
  bwOnly = false
): CreatureMotionArchetype[] {
  const cleanQuery = query.toLowerCase().trim();

  return archetypes.filter((item) => {
    // Category match
    if (category !== "all" && item.category !== category) {
      return false;
    }

    // Black & white / high-contrast filter
    if (bwOnly && !item.bwOptimized && item.contrastLevel !== "ultra") {
      return false;
    }

    // Keyword / Query match
    if (cleanQuery) {
      const matchName = item.name.toLowerCase().includes(cleanQuery);
      const matchSummary = item.summary.toLowerCase().includes(cleanQuery);
      const matchTags = item.tags?.some((t) => t.toLowerCase().includes(cleanQuery));
      if (!matchName && !matchSummary && !matchTags) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Analyzes shape metrics and scores each archetype to find the absolute
 * highest "wow factor" optical recommendations.
 */
export function generateMotionRecommendations(
  metrics: ShapeMetrics,
  currentSettings?: ZoneSettings
): MotionAnalysisResult {
  const scoredArchetypes: CreatureMotionArchetype[] = ARCHETYPE_DATABASE.map((item) => {
    let score = 50;
    const reasons: string[] = [];

    // 1. Aspect Ratio & Geometric Orientation matching
    if (metrics.aspectType === "horizontal") {
      if (item.id === "galloping-horse") {
        score += metrics.aspectRatio > 2.0 ? 44 : 38;
        reasons.push(`Elongated horizontal geometry (Aspect Ratio ${metrics.aspectRatio}x) matches Muybridge horse gallop physics.`);
      } else if (item.id === "swimming-koi" || item.id === "prowling-panther" || item.id === "walking-man") {
        score += 36;
        reasons.push(`Lateral horizontal canvas allows continuous stride/swimming silhouette translation.`);
      } else if (item.id === "sinuous-harmonic-wave") {
        score += metrics.sinuosity > 1.4 ? 40 : 25;
        reasons.push("Wide lateral canvas allows traveling transverse wave crest propagation.");
      } else if (item.id === "vertical-butterfly" || item.id === "pulsing-jellyfish" || item.id === "blooming-lotus") {
        score -= 35;
      }
    } else if (metrics.aspectType === "vertical") {
      if (item.id === "vertical-butterfly") {
        score += 46;
        reasons.push(`Tall vertical geometry (Aspect Ratio 1:${(1 / metrics.aspectRatio).toFixed(1)}) perfectly fits vertical butterfly wing strokes.`);
      } else if (item.id === "pulsing-jellyfish" || item.id === "flapping-bat" || item.id === "blooming-lotus") {
        score += 38;
        reasons.push("Vertical elongation accommodates vertical hydrostatic bell contraction & petal unfurling.");
      } else if (item.id === "galloping-horse" || item.id === "swimming-koi") {
        score -= 35;
      }
    } else if (metrics.aspectType === "equilateral") {
      if (item.id === "rotating-cogwheel") {
        score += 45;
        reasons.push(`Equilateral symmetry (${(metrics.roundness * 100).toFixed(0)}% circularity) delivers high-speed cogwheel torque.`);
      } else if (item.id === "hypnotic-spiral" || item.id === "pulsing-starburst" || item.id === "beating-heart") {
        score += 40;
        reasons.push(`High roundness quotient (${(metrics.roundness * 100).toFixed(0)}%) maximizes concentric radial illusions without rectangular clipping.`);
      } else if (item.id === "galloping-horse") {
        score -= 15;
      }
    } else if (metrics.aspectType === "diagonal") {
      if (item.id === "soaring-falcon") {
        score += 46;
        reasons.push(`Angled orientation axis (${metrics.principalAngle}°) naturally guides 2D banking flight and raptor dives.`);
      } else if (item.id === "flapping-bat" || item.id === "swimming-koi") {
        score += 28;
        reasons.push("Angled vector alignment creates dynamic diagonal perspective shift.");
      }
    } else if (metrics.aspectType === "serpentine") {
      if (item.id === "sinuous-harmonic-wave") {
        score += 48;
        reasons.push(`High sinuosity curvature factor (${metrics.sinuosity}x) enables rich multi-crest undulating wave motion.`);
      } else if (item.id === "swimming-koi" || item.id === "prowling-panther") {
        score += 32;
        reasons.push("Curved contour profile follows organic spine bending.");
      }
    }

    // 2. Path Length scale discrimination
    if (metrics.pathLength > 400) {
      if (item.recommendedSettings.frameCount >= 8) {
        score += 12;
        reasons.push(`Spacious perimeter (${metrics.pathLength}px) supports dense ${item.recommendedSettings.frameCount}-frame high-definition cycles.`);
      }
    } else if (metrics.pathLength < 200) {
      if (item.recommendedSettings.frameCount <= 6) {
        score += 12;
        reasons.push(`Compact boundary length (${metrics.pathLength}px) stays razor-sharp with optimized 6-frame cycles.`);
      }
    }

    // 3. Ultra High-Contrast B&W Bonus
    if (item.bwOptimized) {
      score += 10;
      reasons.push("Pure solid black & white silhouette maximizes physical slit transmission contrast.");
    }

    const clampedScore = Math.max(10, Math.min(99, score));

    return {
      ...item,
      suitabilityScore: clampedScore,
      suitabilityReasons: reasons.length > 0 ? reasons : ["Compatible universal optical motion pattern."],
    };
  });

  // Sort by suitability score descending
  scoredArchetypes.sort((a, b) => b.suitabilityScore - a.suitabilityScore);

  const primaryRecommendation = scoredArchetypes[0];

  // Evaluate current user settings alignment
  let currentAlignmentScore = 70;
  let currentAlignmentFeedback = "Settings are well balanced.";

  if (currentSettings) {
    const angleDiff = Math.abs(currentSettings.revealDirection.angle - primaryRecommendation.recommendedSettings.revealDirection.angle) % 180;
    const normalizedAngleDiff = Math.min(angleDiff, 180 - angleDiff);

    if (normalizedAngleDiff <= 15) {
      currentAlignmentScore = 95;
      currentAlignmentFeedback = `Optimal Angle (${currentSettings.revealDirection.angle}°)! Perfectly matched to '${primaryRecommendation.name}'.`;
    } else if (normalizedAngleDiff <= 45) {
      currentAlignmentScore = 78;
      currentAlignmentFeedback = `Good alignment (${currentSettings.revealDirection.angle}°). Consider tuning to ${primaryRecommendation.recommendedSettings.revealDirection.angle}° for maximum lateral wave clarity.`;
    } else {
      currentAlignmentScore = 52;
      currentAlignmentFeedback = `Phase angle (${currentSettings.revealDirection.angle}°) is offset from the shape's principal axis (${metrics.principalAngle}°). Suggested: ${primaryRecommendation.recommendedSettings.revealDirection.angle}°.`;
    }
  }

  return {
    metrics,
    currentAlignmentScore,
    currentAlignmentFeedback,
    primaryRecommendation,
    allRecommendations: scoredArchetypes,
  };
}
