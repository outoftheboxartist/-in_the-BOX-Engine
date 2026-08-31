/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SampleSVG {
  name: string;
  description: string;
  content: string;
}

export const SAMPLE_SVGS: SampleSVG[] = [
  {
    name: "Illusion Box",
    description: "An isometric optical block where different faces can be animated in complementary directions.",
    content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <!-- Background subtle grid/accents -->
  <rect width="400" height="400" fill="transparent" />
  
  <g transform="translate(200, 200)">
    <!-- Top Face of Isometric Cube -->
    <path id="iso-top" d="M 0 -120 L 104 -60 L 0 0 L -104 -60 Z" fill="#2d3748" stroke="#f43f5e" stroke-width="2" />
    
    <!-- Left Face of Isometric Cube -->
    <path id="iso-left" d="M -104 -60 L 0 0 L 0 120 L -104 60 Z" fill="#1a202c" stroke="#3b82f6" stroke-width="2" />
    
    <!-- Right Face of Isometric Cube -->
    <path id="iso-right" d="M 0 0 L 104 -60 L 104 60 L 0 120 Z" fill="#4a5568" stroke="#10b981" stroke-width="2" />
    
    <!-- Nested floating inner shapes for depth -->
    <!-- Top Inner -->
    <path id="inner-top" d="M 0 -60 L 52 -30 L 0 0 L -52 -30 Z" fill="#4a5568" stroke="#ffffff" stroke-dasharray="4" stroke-width="1.5" />
    
    <!-- Left Inner -->
    <path id="inner-left" d="M -52 -30 L 0 0 L 0 60 L -52 30 Z" fill="#2d3748" stroke="#ffffff" stroke-dasharray="4" stroke-width="1.5" />
    
    <!-- Right Inner -->
    <path id="inner-right" d="M 0 0 L 52 -30 L 52 30 L 0 60 Z" fill="#718096" stroke="#ffffff" stroke-dasharray="4" stroke-width="1.5" />
  </g>
</svg>`
  },
  {
    name: "Concentric Wavefront",
    description: "A series of nested circular wave zones for testing radial or multidirectional parallax shifts.",
    content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <g transform="translate(200, 200)">
    <!-- Outermost ring -->
    <circle id="ring-outer-4" r="160" fill="none" stroke="#e2e8f0" stroke-width="14" />
    <!-- Segment rings -->
    <circle id="ring-outer-3" r="130" fill="none" stroke="#cbd5e1" stroke-width="14" />
    <circle id="ring-outer-2" r="100" fill="none" stroke="#94a3b8" stroke-width="14" />
    <circle id="ring-outer-1" r="70" fill="none" stroke="#64748b" stroke-width="14" />
    
    <!-- Central optical iris -->
    <circle id="iris-center" r="35" fill="#475569" stroke="#f1f5f9" stroke-width="3" />
    
    <!-- Floating geometric satellites -->
    <rect id="satellite-top" x="-15" y="-185" width="30" height="30" rx="6" fill="#f43f5e" />
    <rect id="satellite-bottom" x="-15" y="155" width="30" height="30" rx="6" fill="#3b82f6" />
    <polygon id="satellite-left" points="-185,-15 -155,0 -185,15" fill="#10b981" />
    <polygon id="satellite-right" points="185,-15 155,0 185,15" fill="#f59e0b" />
  </g>
</svg>`
  },
  {
    name: "Optical Vortex Layers",
    description: "Dynamic overlapping triangles that alternate depths, creating a strong parallax illusion.",
    content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <g transform="translate(200, 200)">
    <!-- Layer 1 Large Triangle -->
    <polygon id="triangle-large" points="0,-160 140,80 -140,80" fill="#0f172a" stroke="#f43f5e" stroke-width="3" />
    
    <!-- Layer 2 Medium Reversed Triangle -->
    <polygon id="triangle-med" points="0,120 100,-60 -100,-60" fill="#1e293b" stroke="#3b82f6" stroke-width="3" />
    
    <!-- Layer 3 Small Triangle -->
    <polygon id="triangle-small" points="0,-70 60,30 -60,30" fill="#334155" stroke="#10b981" stroke-width="2" />
    
    <!-- Core diamond -->
    <polygon id="core-diamond" points="0,-20 20,0 0,20 -20,0" fill="#e2e8f0" stroke="#f59e0b" stroke-width="2" />
  </g>
</svg>`
  }
];
