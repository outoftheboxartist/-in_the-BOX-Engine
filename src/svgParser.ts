/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SVGZoneInfo, ZoneSettings } from "./types";

/**
 * Parses an SVG string, finds matches for shapes, injects unique IDs,
 * list-classes, and extracts structural metadata.
 */
export function instrumentSVG(svgText: string): {
  instrumentedSvgContent: string;
  zones: SVGZoneInfo[];
} {
  try {
    const parser = new DOMParser();
    // Parse the raw input text
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    
    // Check for parsing errors
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      throw new Error(parserError.textContent || "Invalid SVG XML syntax");
    }

    const svgElement = doc.querySelector("svg");
    if (!svgElement) {
      throw new Error("No <svg> element found in the uploaded content");
    }

    // Ensure responsive attributes
    if (!svgElement.getAttribute("viewBox")) {
      const width = svgElement.getAttribute("width") || "400";
      const height = svgElement.getAttribute("height") || "400";
      // Sanitize the width/height to numbers
      const wNum = parseFloat(width) || 400;
      const hNum = parseFloat(height) || 400;
      svgElement.setAttribute("viewBox", `0 0 ${wNum} ${hNum}`);
    }
    
    // Set width and height to 100% to fill container and follow responsive rules
    svgElement.setAttribute("width", "100%");
    svgElement.setAttribute("height", "100%");

    // Find printable shapes
    const shapeElements = doc.querySelectorAll("path, rect, circle, ellipse, polygon");
    const zones: SVGZoneInfo[] = [];

    shapeElements.forEach((el, index) => {
      const id = `zone-${index}`;
      el.setAttribute("data-zone-id", id);
      el.setAttribute("role", "button");
      
      const tagName = el.tagName.toLowerCase();
      const originalId = el.getAttribute("id") || null;
      
      const readableTagName = tagName.charAt(0).toUpperCase() + tagName.slice(1);
      const defaultName = originalId 
        ? originalId 
        : `${readableTagName} #${index + 1}`;

      zones.push({
        id,
        tagName,
        originalId,
        defaultName
      });
    });

    const serializer = new XMLSerializer();
    const instrumentedSvgContent = serializer.serializeToString(doc);

    return {
      instrumentedSvgContent,
      zones
    };
  } catch (error) {
    console.error("Error instrumenting SVG:", error);
    throw error;
  }
}

/**
 * Creates default ZoneSettings for a list of zones.
 */
export function createDefaultSettingsForZones(
  zones: SVGZoneInfo[],
  existingSettings: Record<string, ZoneSettings> = {}
): Record<string, ZoneSettings> {
  const settings: Record<string, ZoneSettings> = {};

  zones.forEach((zone) => {
    // Check if we can reuse matching settings from existing by originalId or by id index
    let reused: ZoneSettings | undefined = undefined;

    if (existingSettings[zone.id]) {
      reused = existingSettings[zone.id];
    } else {
      // Look up by originalId if available
      if (zone.originalId) {
        const found = Object.values(existingSettings).find(
          (s) => s.originalId === zone.originalId
        );
        if (found) reused = found;
      }
    }

    if (reused) {
      settings[zone.id] = {
        ...reused,
        zoneId: zone.id, // Update to new target ID just in case
      };
    } else {
      // Default Settings
      settings[zone.id] = {
        zoneId: zone.id,
        tagName: zone.tagName,
        originalId: zone.originalId,
        zoneName: zone.defaultName,
        frameCount: 6,
        windowWidth: 1.0,
        revealDirection: {
          dx: 1.0, // Left to Right
          dy: 0.0,
          angle: 0
        },
        notes: "",
      };
    }
  });

  return settings;
}
