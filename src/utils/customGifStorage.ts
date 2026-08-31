/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CustomUploadedGif {
  id: string;
  title: string;
  category: "quadruped" | "birds" | "aquatic" | "humanoid" | "mechanical" | "celestial" | "serpentine" | "organic" | "custom";
  categoryLabel: string;
  url: string;
  previewUrl: string;
  frames: string[];
  contrastLevel: "high" | "ultra";
  tags: string[];
  createdAt: number;
}

const STORAGE_KEY = "scanimation_custom_uploaded_gifs";

export function loadCustomGifs(): CustomUploadedGif[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to load custom GIFs from localStorage:", e);
    return [];
  }
}

export const getCustomGifs = loadCustomGifs;

export function saveCustomGif(gif: CustomUploadedGif): void {
  try {
    const existing = loadCustomGifs();
    const updated = [gif, ...existing.filter((g) => g.id !== gif.id)].slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("Failed to save custom GIF:", e);
  }
}

export function deleteCustomGif(id: string): void {
  try {
    const existing = loadCustomGifs();
    const updated = existing.filter((g) => g.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("Failed to delete custom GIF:", e);
  }
}
