const STORAGE_KEY = 'saved_links';
const CUSTOM_FOLDERS_KEY = 'custom_folders';

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
 */
export function normalizeUrl(url: string): string {
  try {
    let normalized = url.trim();
    
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = 'https://' + normalized;
    }
    
    const urlObj = new URL(normalized);
    urlObj.hostname = urlObj.hostname.toLowerCase();
    urlObj.hash = '';
    
    let result = urlObj.href;
    if (result.endsWith('/') && urlObj.pathname === '/') {
      result = result.slice(0, -1);
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
    
    const existing = links.find(link => normalizeUrl(link.url) === normalizedNewUrl);
    if (existing) {
      console.log('[SavedLinks] Duplicate detected:', url);
      return { link: existing, status: 'duplicate' };
    }
    
    const newLink: SavedLink = {
      id: crypto.randomUUID(),
      url: normalizedNewUrl,
      title: title || extractTitleFromUrl(normalizedNewUrl),
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
    if (updates.url !== undefined) link.url = normalizeUrl(updates.url);
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

export function removeSavedLink(id: string): SavedLink | null {
  const links = getSavedLinks();
  const removedLink = links.find(link => link.id === id) || null;
  const filtered = links.filter(link => link.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
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
}

export function updateSavedLinkTitle(id: string, title: string): void {
  const links = getSavedLinks();
  const link = links.find(l => l.id === id);
  if (link) {
    link.title = title;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
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