/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ZoneArtwork } from "../types";

const DB_NAME = "inthebox_scanimation_db";
const STORE_NAME = "artworks";
const DB_VERSION = 1;

/**
 * Initializes and opens the IndexedDB database.
 */
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      resolve(null);
      return;
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.warn("IndexedDB open failed, fallback active");
        resolve(null);
      };
    } catch (e) {
      console.warn("IndexedDB initialization error:", e);
      resolve(null);
    }
  });
}

/**
 * Persists high-resolution artwork and stop-motion frames into IndexedDB.
 */
export async function saveZoneArtworksToDb(artworks: Record<string, ZoneArtwork>): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;

    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(artworks, "all_zone_artworks");

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Could not persist artworks to IndexedDB:", err);
  }
}

/**
 * Loads artwork frames from IndexedDB.
 */
export async function loadZoneArtworksFromDb(): Promise<Record<string, ZoneArtwork> | null> {
  try {
    const db = await openDb();
    if (!db) return null;

    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get("all_zone_artworks");

    return new Promise((resolve) => {
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => {
        resolve(null);
      };
    });
  } catch (err) {
    console.warn("Could not load artworks from IndexedDB:", err);
    return null;
  }
}

/**
 * Safely writes to localStorage without ever throwing QuotaExceededError.
 */
export function safeSetLocalStorage(key: string, value: any): void {
  try {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    localStorage.setItem(key, serialized);
  } catch (err: any) {
    if (
      err?.name === "QuotaExceededError" ||
      err?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err?.code === 22 ||
      err?.code === 1014
    ) {
      console.warn(`localStorage quota exceeded for key "${key}". Cleaning up heavy cache...`);
      // Evict any heavy legacy keys
      try {
        localStorage.removeItem("inthebox_zoneArtworks");
        localStorage.removeItem("inthebox_originalSvgContent");
        const serialized = typeof value === "string" ? value : JSON.stringify(value);
        localStorage.setItem(key, serialized);
      } catch {
        // Suppress error so user session remains uninterrupted
      }
    } else {
      console.warn(`localStorage.setItem failed for key "${key}":`, err);
    }
  }
}

/**
 * Safely reads from localStorage without throwing.
 */
export function safeGetLocalStorage<T = any>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  } catch (err) {
    console.warn(`localStorage.getItem failed for key "${key}":`, err);
    return null;
  }
}
