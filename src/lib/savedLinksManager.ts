import { getSettings } from './settingsManager';
import { recordDeletion } from './deletionTracker';

const STORAGE_KEY = 'saved_links';
const CUSTOM_FOLDERS_KEY = 'custom_folders';
const TRASH_STORAGE_KEY = 'saved_links_trash';

function getRetentionMs(): number {
  const days = getSettings().trashRetentionDays;
  return days * 24 * 60 * 60 * 1000;
}

/**
 * Notify auto-sync that bookmarks have changed
 */
function notifyChange() {
  window.dispatchEvent(new CustomEvent('bookmarks-changed', { 
    detail: { key: STORAGE_KEY } 
  }));
}

/**
 * Notify auto-sync that trash has changed
 */
function notifyTrashChange() {
  window.dispatchEvent(new CustomEvent('bookmarks-changed', { 
    detail: { key: TRASH_STORAGE_KEY } 
  }));
}

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
 * Note: Hash fragments are preserved for duplicate detection
 */
export function normalizeUrl(url: string): string {
  try {
    let normalized = url.trim();
    
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = 'https://' + normalized;
    }
    
    const urlObj = new URL(normalized);
    
    // Normalize hostname: lowercase and remove www prefix
    urlObj.hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
    
    // Keep hash fragments - they are important for duplicate detection
    // e.g., example.com/page#section1 and example.com/page#section2 are different URLs
    
    // Sort query parameters for consistent comparison
    if (urlObj.search) {
      const params = new URLSearchParams(urlObj.search);
      const sortedParams = new URLSearchParams([...params.entries()].sort());
      urlObj.search = sortedParams.toString();
    }
    
    let result = urlObj.href;
    
    // Remove trailing slash from path only (not affecting query or hash)
    // Only if there's no query string and no hash after the slash
    if (urlObj.pathname.endsWith('/') && urlObj.pathname.length > 1) {
      const pathWithoutSlash = urlObj.pathname.slice(0, -1);
      result = urlObj.origin + pathWithoutSlash + urlObj.search + urlObj.hash;
    }
    
    return result;
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Find an existing saved link by URL
 */
export function findSavedLinkByUrl(url: string): SavedLink | null {
  if (!url.trim()) return null;
  
  try {
    const links = getSavedLinks();
    const normalizedUrl = normalizeUrl(url);
    return links.find(link => normalizeUrl(link.url) === normalizedUrl) || null;
  } catch {
    return null;
  }
}

function extractTitleFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function getSavedLinks(): SavedLink[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    const links = JSON.parse(stored);
    if (!Array.isArray(links)) return [];
    
    return links.map((link: any) => ({
      ...link,
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
    
    // Use normalizeUrl ONLY for duplicate detection
    const existing = links.find(link => normalizeUrl(link.url) === normalizedNewUrl);
    if (existing) {
      console.log('[SavedLinks] Duplicate detected:', url);
      return { link: existing, status: 'duplicate' };
    }
    
    // Preserve original URL, only add protocol if missing
    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl;
    }
    
    const newLink: SavedLink = {
      id: crypto.randomUUID(),
      url: finalUrl, // Original URL preserved (only protocol added if missing)
      title: title || extractTitleFromUrl(finalUrl),
      description: description || '',
      tag: tag || null,
      createdAt: Date.now(),
    };
    
    links.unshift(newLink);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
    
    const verified = getSavedLinks().find(l => l.id === newLink.id);
    if (!verified) {
      console.error('[SavedLinks] Failed to verify save');
      return { link: null, status: 'failed' };
    }
    
    console.log('[SavedLinks] Successfully saved:', newLink.url);
    notifyChange();
    return { link: newLink, status: 'added' };
  } catch (e) {
    console.error('[SavedLinks] Failed to save link:', e);
    return { link: null, status: 'failed' };
  }
}

export function updateSavedLink(
  id: string, 
  updates: Partial<Pick<SavedLink, 'title' | 'description' | 'tag' | 'url'>>
): void {
  const links = getSavedLinks();
  const link = links.find(l => l.id === id);
  if (link) {
    if (updates.title !== undefined) link.title = updates.title;
    if (updates.description !== undefined) link.description = updates.description;
    if (updates.tag !== undefined) link.tag = updates.tag;
    if (updates.url !== undefined) {
      // Preserve original URL, only add protocol if missing
      let newUrl = updates.url.trim();
      if (!/^https?:\/\//i.test(newUrl)) {
        newUrl = 'https://' + newUrl;
      }
      link.url = newUrl;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
    notifyChange();
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

export function removeSavedLink(id: string): SavedLink | null {
  const links = getSavedLinks();
  const removedLink = links.find(link => link.id === id) || null;
  const filtered = links.filter(link => link.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  
  // Move to trash
  if (removedLink) {
    moveToTrash(removedLink);
    notifyChange();
  }
  
  return removedLink;
}

export function restoreSavedLink(link: SavedLink): void {
  const links = getSavedLinks();
  // Insert at original position based on createdAt, or at start
  const insertIndex = links.findIndex(l => l.createdAt < link.createdAt);
  if (insertIndex === -1) {
    links.push(link);
  } else {
    links.splice(insertIndex, 0, link);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  
  // Also remove from trash if present
  removeFromTrash(link.id);
  notifyChange();
}

export function updateSavedLinkTitle(id: string, title: string): void {
  const links = getSavedLinks();
  const link = links.find(l => l.id === id);
  if (link) {
    link.title = title;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
    notifyChange();
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
    notifyChange();
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
  notifyChange();
}

// Reorder links
export function reorderLinks(orderedIds: string[]): void {
  const links = getSavedLinks();
  const linkMap = new Map(links.map(link => [link.id, link]));
  
  const reordered: SavedLink[] = [];
  orderedIds.forEach(id => {
    const link = linkMap.get(id);
    if (link) {
      reordered.push(link);
      linkMap.delete(id);
    }
  });
  
  linkMap.forEach(link => reordered.push(link));
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reordered));
}

// Custom folder management
export interface CustomFolder {
  name: string;
  icon: string;
}

const FOLDER_ICONS_KEY = 'folder_icons';

export function getFolderIcons(): Record<string, string> {
  try {
    const stored = localStorage.getItem(FOLDER_ICONS_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

export function setFolderIcon(folderName: string, iconName: string): void {
  const icons = getFolderIcons();
  icons[folderName] = iconName;
  localStorage.setItem(FOLDER_ICONS_KEY, JSON.stringify(icons));
}

export function getFolderIcon(folderName: string): string | null {
  const icons = getFolderIcons();
  return icons[folderName] || null;
}

export function removeFolderIcon(folderName: string): void {
  const icons = getFolderIcons();
  delete icons[folderName];
  localStorage.setItem(FOLDER_ICONS_KEY, JSON.stringify(icons));
}

export function getCustomFolders(): string[] {
  try {
    const stored = localStorage.getItem(CUSTOM_FOLDERS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function addCustomFolder(name: string, icon?: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  
  const existing = getCustomFolders();
  if (existing.includes(trimmed) || PRESET_TAGS.includes(trimmed)) {
    return false;
  }
  
  existing.push(trimmed);
  localStorage.setItem(CUSTOM_FOLDERS_KEY, JSON.stringify(existing));
  
  if (icon) {
    setFolderIcon(trimmed, icon);
  }
  
  return true;
}

export function removeCustomFolder(name: string): void {
  const folders = getCustomFolders().filter(f => f !== name);
  localStorage.setItem(CUSTOM_FOLDERS_KEY, JSON.stringify(folders));
  
  // Remove the icon
  removeFolderIcon(name);
  
  const links = getSavedLinks();
  links.forEach(link => {
    if (link.tag === name) {
      link.tag = null;
    }
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

export function renameFolder(oldName: string, newName: string): void {
  // Update custom folders list
  const folders = getCustomFolders();
  const index = folders.indexOf(oldName);
  if (index !== -1) {
    folders[index] = newName;
    localStorage.setItem(CUSTOM_FOLDERS_KEY, JSON.stringify(folders));
  }
  
  // Move icon to new name
  const icon = getFolderIcon(oldName);
  if (icon) {
    removeFolderIcon(oldName);
    setFolderIcon(newName, icon);
  }
  
  // Update all links with this tag
  const links = getSavedLinks();
  links.forEach(link => {
    if (link.tag === oldName) {
      link.tag = newName;
    }
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

export function getAllFolders(): string[] {
  const custom = getCustomFolders();
  const used = getAllTags();
  const combined = new Set([...PRESET_TAGS, ...custom, ...used]);
  return Array.from(combined).sort();
}

export function moveToFolder(linkId: string, folderName: string | null): void {
  updateSavedLink(linkId, { tag: folderName });
}

// ============= TRASH MANAGEMENT =============

export interface TrashedLink extends SavedLink {
  deletedAt: number;
  /** Retention period in days that was active when the item was trashed */
  retentionDays: number;
  /** 
   * Whether this trash item can be restored.
   * Set to false for items downloaded from cloud that may have ID conflicts.
   * Undefined or true means restorable.
   */
  restorable?: boolean;
}

/**
 * Get all trashed links (auto-purges expired items)
 */
export function getTrashLinks(): TrashedLink[] {
  purgeExpiredTrash();
  try {
    const stored = localStorage.getItem(TRASH_STORAGE_KEY);
    if (!stored) return [];
    
    const links = JSON.parse(stored);
    if (!Array.isArray(links)) return [];
    
    return links;
  } catch (e) {
    console.error('[Trash] Failed to read from localStorage:', e);
    return [];
  }
}

/**
 * Move a link to trash with deletedAt timestamp
 */
function moveToTrash(link: SavedLink): void {
  const trashLinks = getTrashLinks();
  
  // Check if already in trash (shouldn't happen but be safe)
  if (trashLinks.some(t => t.id === link.id)) {
    return;
  }
  
  const trashedLink: TrashedLink = {
    ...link,
    deletedAt: Date.now(),
    retentionDays: getSettings().trashRetentionDays,
  };
  
  trashLinks.unshift(trashedLink);
  localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(trashLinks));
  notifyTrashChange();
}

/**
 * Remove a link from trash (internal helper)
 */
function removeFromTrash(id: string): void {
  const trashLinks = getTrashLinks();
  const filtered = trashLinks.filter(link => link.id !== id);
  localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(filtered));
  notifyTrashChange();
}

/**
 * Restore a link from trash back to main storage
 * Returns null if item not found or not restorable
 */
export function restoreFromTrash(id: string): SavedLink | null {
  const trashLinks = getTrashLinks();
  const trashedLink = trashLinks.find(link => link.id === id);
  
  if (!trashedLink) return null;
  
  // Check if item is marked as non-restorable
  if (trashedLink.restorable === false) {
    console.warn('[Trash] Cannot restore non-restorable item:', id);
    return null;
  }
  
  // Remove trash-specific fields before restoring
  const { deletedAt, retentionDays, restorable, ...restoredLink } = trashedLink;
  
  // Restore to main storage
  restoreSavedLink(restoredLink);
  
  return restoredLink;
}

/**
 * Check if a trash item is restorable
 */
export function isTrashItemRestorable(id: string): boolean {
  const trashLinks = getTrashLinks();
  const trashedLink = trashLinks.find(link => link.id === id);
  
  if (!trashedLink) return false;
  
  // restorable is true by default if undefined
  return trashedLink.restorable !== false;
}

/**
 * Permanently delete a link from trash
 */
export function permanentlyDelete(id: string): void {
  recordDeletion('bookmark', id);
  removeFromTrash(id);
}

/**
 * Empty all items from trash
 */
export function emptyTrash(): void {
  const items = getTrashLinks();
  items.forEach(item => recordDeletion('bookmark', item.id));
  localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify([]));
  notifyTrashChange();
}

export function restoreAllFromTrash(): SavedLink[] {
  const trashLinks = getTrashLinks();
  const restored: SavedLink[] = [];
  
  trashLinks.forEach(link => {
    const result = restoreFromTrash(link.id);
    if (result) restored.push(result);
  });
  
  return restored;
}

/**
 * Get the count of items in trash
 */
export function getTrashCount(): number {
  return getTrashLinks().length;
}

/**
 * Auto-remove items older than 30 days
 */
function purgeExpiredTrash(): void {
  try {
    const stored = localStorage.getItem(TRASH_STORAGE_KEY);
    if (!stored) return;
    
    const links: TrashedLink[] = JSON.parse(stored);
    if (!Array.isArray(links)) return;
    
    const now = Date.now();
    const currentRetentionDays = getSettings().trashRetentionDays;
    const validLinks = links.filter(link => {
      // Use the retention period that was active when item was trashed
      // Fall back to current setting for legacy items without stored retentionDays
      const itemRetentionDays = link.retentionDays ?? currentRetentionDays;
      const retentionMs = itemRetentionDays * 24 * 60 * 60 * 1000;
      const age = now - link.deletedAt;
      return age < retentionMs;
    });
    
    if (validLinks.length !== links.length) {
      console.log(`[Trash] Purged ${links.length - validLinks.length} expired items`);
      localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(validLinks));
    }
  } catch (e) {
    console.error('[Trash] Failed to purge expired items:', e);
  }
}

/**
 * Get days remaining before a trashed item is auto-deleted
 */
export function getDaysRemaining(deletedAt: number, retentionDays?: number): number {
  // Use the stored retention period, or fall back to current setting for legacy items
  const itemRetentionDays = retentionDays ?? getSettings().trashRetentionDays;
  const retentionMs = itemRetentionDays * 24 * 60 * 60 * 1000;
  const expiresAt = deletedAt + retentionMs;
  const remaining = expiresAt - Date.now();
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}