const STORAGE_KEY = 'saved_links';

export const PRESET_TAGS = ['Work', 'Personal', 'Social', 'News', 'Entertainment', 'Shopping'];

export interface SavedLink {
  id: string;
  url: string;
  title: string;
  description?: string;
  tag: string | null;
  createdAt: number;
  isShortlisted?: boolean;
}

/**
 * Normalize URL for consistent duplicate detection
 * - Ensures protocol exists (defaults to https://)
 * - Lowercases hostname
 * - Removes trailing slash for cleaner comparison
 * - Removes fragment (#...) as it's usually not meaningful for bookmarks
 */
function normalizeUrl(url: string): string {
  try {
    let normalized = url.trim();
    
    // Add protocol if missing
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = 'https://' + normalized;
    }
    
    const urlObj = new URL(normalized);
    
    // Lowercase hostname
    urlObj.hostname = urlObj.hostname.toLowerCase();
    
    // Remove fragment
    urlObj.hash = '';
    
    // Get the full URL and remove trailing slash (but not for paths like /page/)
    let result = urlObj.href;
    if (result.endsWith('/') && urlObj.pathname === '/') {
      result = result.slice(0, -1);
    }
    
    return result;
  } catch {
    // If URL parsing fails, return trimmed original
    return url.trim().toLowerCase();
  }
}

export function getSavedLinks(): SavedLink[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    const links = JSON.parse(stored);
    if (!Array.isArray(links)) return [];
    
    // Migrate old links with tags array to single tag
    return links.map((link: any) => ({
      ...link,
      // Migration: use first tag from old array, or existing tag, or null
      tag: link.tag !== undefined ? link.tag : (link.tags?.[0] || null),
      description: link.description || '',
    }));
  } catch (e) {
    console.error('[SavedLinks] Failed to read from localStorage:', e);
    return [];
  }
}

export type AddLinkStatus = 'added' | 'duplicate' | 'failed';

export interface AddLinkResult {
  link: SavedLink | null;
  status: AddLinkStatus;
}

export function addSavedLink(
  url: string, 
  title?: string, 
  description?: string, 
  tag?: string | null
): AddLinkResult {
  try {
    const links = getSavedLinks();
    const normalizedNewUrl = normalizeUrl(url);
    
    // Check if URL already exists (using normalized comparison)
    const existing = links.find(link => normalizeUrl(link.url) === normalizedNewUrl);
    if (existing) {
      console.log('[SavedLinks] Duplicate detected:', url);
      return { link: existing, status: 'duplicate' };
    }
    
    const newLink: SavedLink = {
      id: crypto.randomUUID(),
      url: normalizedNewUrl, // Store the normalized URL
      title: title || extractTitleFromUrl(normalizedNewUrl),
      description: description || '',
      tag: tag || null,
      createdAt: Date.now(),
    };
    
    links.unshift(newLink);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
    
    // Verify save was successful
    const verified = getSavedLinks().find(l => l.id === newLink.id);
    if (!verified) {
      console.error('[SavedLinks] Failed to verify save');
      return { link: null, status: 'failed' };
    }
    
    console.log('[SavedLinks] Successfully saved:', newLink.url);
    return { link: newLink, status: 'added' };
  } catch (e) {
    console.error('[SavedLinks] Failed to save link:', e);
    return { link: null, status: 'failed' };
  }
}

export function updateSavedLink(
  id: string, 
  updates: Partial<Pick<SavedLink, 'title' | 'description' | 'tag'>>
): void {
  const links = getSavedLinks();
  const link = links.find(l => l.id === id);
  if (link) {
    if (updates.title !== undefined) link.title = updates.title;
    if (updates.description !== undefined) link.description = updates.description;
    if (updates.tag !== undefined) link.tag = updates.tag;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  }
}

export function getAllTags(): string[] {
  const links = getSavedLinks();
  const tagsSet = new Set<string>();
  links.forEach(link => {
    if (link.tag) tagsSet.add(link.tag);
  });
  return Array.from(tagsSet);
}

export function getLinksByTag(tag: string): SavedLink[] {
  const links = getSavedLinks();
  return links.filter(link => link.tag === tag);
}

export function removeSavedLink(id: string): void {
  const links = getSavedLinks();
  const filtered = links.filter(link => link.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function updateSavedLinkTitle(id: string, title: string): void {
  const links = getSavedLinks();
  const link = links.find(l => l.id === id);
  if (link) {
    link.title = title;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  }
}

function extractTitleFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove www. prefix and return hostname
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function searchSavedLinks(query: string): SavedLink[] {
  const links = getSavedLinks();
  const lowerQuery = query.toLowerCase();
  
  return links.filter(link => 
    link.title.toLowerCase().includes(lowerQuery) ||
    link.url.toLowerCase().includes(lowerQuery)
  );
}

// Shortlist functions
export function toggleShortlist(id: string): void {
  const links = getSavedLinks();
  const link = links.find(l => l.id === id);
  if (link) {
    link.isShortlisted = !link.isShortlisted;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  }
}

export function getShortlistedLinks(): SavedLink[] {
  const links = getSavedLinks();
  return links.filter(link => link.isShortlisted === true);
}

export function clearAllShortlist(): void {
  const links = getSavedLinks();
  links.forEach(link => {
    link.isShortlisted = false;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}
