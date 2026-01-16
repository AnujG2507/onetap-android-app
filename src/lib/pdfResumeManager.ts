/**
 * PDF Resume Manager
 * Stores and retrieves last viewed page positions, zoom levels, and reading modes for PDF shortcuts
 */

const STORAGE_KEY = 'onetap_pdf_positions';

export type ReadingMode = 'system' | 'light' | 'dark' | 'sepia';

interface PDFPosition {
  page: number;
  zoom: number;
  readingMode: ReadingMode;
  lastAccessed: number;
}

interface PDFPositions {
  [shortcutId: string]: PDFPosition;
}

function getPositions(): PDFPositions {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function savePositions(positions: PDFPositions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch (error) {
    console.error('[PDFResumeManager] Failed to save positions:', error);
  }
}

function getOrCreatePosition(shortcutId: string): PDFPosition {
  const positions = getPositions();
  return positions[shortcutId] || {
    page: 1,
    zoom: 1,
    readingMode: 'system',
    lastAccessed: Date.now(),
  };
}

/**
 * Get the last viewed page for a shortcut
 * Returns null if no position saved
 */
export function getLastPage(shortcutId: string): number | null {
  const positions = getPositions();
  const position = positions[shortcutId];
  
  if (position && position.page > 0) {
    console.log(`[PDFResumeManager] Found saved page ${position.page} for shortcut ${shortcutId}`);
    return position.page;
  }
  
  return null;
}

/**
 * Save the current page position for a shortcut
 */
export function saveLastPage(shortcutId: string, page: number): void {
  if (!shortcutId || page < 1) return;
  
  const positions = getPositions();
  const existing = positions[shortcutId] || getOrCreatePosition(shortcutId);
  
  positions[shortcutId] = {
    ...existing,
    page,
    lastAccessed: Date.now(),
  };
  
  savePositions(positions);
  console.log(`[PDFResumeManager] Saved page ${page} for shortcut ${shortcutId}`);
}

/**
 * Get the last zoom level for a shortcut
 */
export function getLastZoom(shortcutId: string): number {
  const positions = getPositions();
  const position = positions[shortcutId];
  return position?.zoom || 1;
}

/**
 * Save the zoom level for a shortcut
 */
export function saveZoom(shortcutId: string, zoom: number): void {
  if (!shortcutId || zoom < 0.5 || zoom > 3) return;
  
  const positions = getPositions();
  const existing = positions[shortcutId] || getOrCreatePosition(shortcutId);
  
  positions[shortcutId] = {
    ...existing,
    zoom,
    lastAccessed: Date.now(),
  };
  
  savePositions(positions);
}

/**
 * Get the reading mode for a shortcut
 */
export function getReadingMode(shortcutId: string): ReadingMode {
  const positions = getPositions();
  const position = positions[shortcutId];
  return position?.readingMode || 'system';
}

/**
 * Save the reading mode for a shortcut
 */
export function saveReadingMode(shortcutId: string, mode: ReadingMode): void {
  if (!shortcutId) return;
  
  const positions = getPositions();
  const existing = positions[shortcutId] || getOrCreatePosition(shortcutId);
  
  positions[shortcutId] = {
    ...existing,
    readingMode: mode,
    lastAccessed: Date.now(),
  };
  
  savePositions(positions);
}

/**
 * Clear the saved position for a shortcut
 */
export function clearPosition(shortcutId: string): void {
  const positions = getPositions();
  delete positions[shortcutId];
  savePositions(positions);
  console.log(`[PDFResumeManager] Cleared position for shortcut ${shortcutId}`);
}

/**
 * Clean up old positions (older than 30 days)
 */
export function cleanupOldPositions(): void {
  const positions = getPositions();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  
  let cleaned = false;
  for (const [id, position] of Object.entries(positions)) {
    if (position.lastAccessed < thirtyDaysAgo) {
      delete positions[id];
      cleaned = true;
    }
  }
  
  if (cleaned) {
    savePositions(positions);
    console.log('[PDFResumeManager] Cleaned up old positions');
  }
}
