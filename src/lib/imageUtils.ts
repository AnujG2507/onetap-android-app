/**
 * Image validation and preloading utilities for bulletproof image loading.
 * These utilities ensure images are validated before rendering to prevent
 * broken image flashes and provide graceful fallbacks.
 */

/**
 * Validates if a string is a potentially valid image source.
 * Does NOT verify the image actually loads - just validates the format.
 */
export function isValidImageSource(src: string | undefined | null): boolean {
  if (!src || typeof src !== 'string') return false;
  if (src.trim() === '') return false;
  
  // Valid base64 data URL
  if (src.startsWith('data:image')) return true;
  
  // Valid blob URL
  if (src.startsWith('blob:')) return true;
  
  // Valid HTTP(S) URL
  if (src.startsWith('http://') || src.startsWith('https://')) return true;
  
  // Android content URI (may or may not work, but worth trying)
  if (src.startsWith('content://')) return true;
  
  // File URI
  if (src.startsWith('file://')) return true;
  
  return false;
}

/**
 * Ensures a thumbnail data string has the proper data URL prefix.
 * Some sources provide raw base64 without the prefix.
 */
export function normalizeBase64(src: string | undefined | null): string | null {
  if (!src || typeof src !== 'string') return null;
  if (src.trim() === '') return null;
  
  // Already has a proper prefix
  if (src.startsWith('data:')) return src;
  
  // Looks like base64 (starts with common base64 chars)
  if (/^[A-Za-z0-9+/]/.test(src)) {
    return `data:image/jpeg;base64,${src}`;
  }
  
  // Other valid source types - return as-is
  return src;
}

/**
 * Builds a priority-ordered array of valid image sources.
 * Filters out invalid sources and normalizes base64 data.
 */
export function buildImageSources(...sources: (string | undefined | null)[]): string[] {
  return sources
    .map(src => {
      // Normalize base64 if needed
      if (src && !src.startsWith('data:') && !src.startsWith('http') && 
          !src.startsWith('blob:') && !src.startsWith('content://') && 
          !src.startsWith('file://')) {
        return normalizeBase64(src);
      }
      return src;
    })
    .filter((src): src is string => isValidImageSource(src));
}

/**
 * Preloads an image and returns whether it loaded successfully.
 * Includes a timeout to prevent hanging on slow/broken sources.
 */
export function preloadImage(src: string, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isValidImageSource(src)) {
      resolve(false);
      return;
    }
    
    const img = new Image();
    let resolved = false;
    
    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
    };
    
    img.onload = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(true);
      }
    };
    
    img.onerror = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(false);
      }
    };
    
    img.src = src;
    
    // Timeout after specified duration
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(false);
      }
    }, timeoutMs);
  });
}

/**
 * Tries multiple image sources in order and returns the first one that loads.
 * Returns null if all sources fail.
 */
export async function findWorkingSource(sources: string[]): Promise<string | null> {
  for (const src of sources) {
    const works = await preloadImage(src);
    if (works) return src;
  }
  return null;
}
