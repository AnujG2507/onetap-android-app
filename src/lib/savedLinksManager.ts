const STORAGE_KEY = 'saved_links';

export const PRESET_TAGS = ['Work', 'Personal', 'Social', 'News', 'Entertainment', 'Shopping'];

export interface SavedLink {
  id: string;
  url: string;
  title: string;
  description?: string;
  tags: string[];
  createdAt: number;
}

export function getSavedLinks(): SavedLink[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const links = stored ? JSON.parse(stored) : [];
    // Migrate old links without tags
    return links.map((link: SavedLink) => ({
      ...link,
      tags: link.tags || [],
      description: link.description || '',
    }));
  } catch {
    return [];
  }
}

export function addSavedLink(
  url: string, 
  title?: string, 
  description?: string, 
  tags: string[] = []
): SavedLink {
  const links = getSavedLinks();
  
  // Check if URL already exists
  const existing = links.find(link => link.url === url);
  if (existing) {
    return existing;
  }
  
  const newLink: SavedLink = {
    id: crypto.randomUUID(),
    url,
    title: title || extractTitleFromUrl(url),
    description: description || '',
    tags,
    createdAt: Date.now(),
  };
  
  links.unshift(newLink);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  
  return newLink;
}

export function updateSavedLink(
  id: string, 
  updates: Partial<Pick<SavedLink, 'title' | 'description' | 'tags'>>
): void {
  const links = getSavedLinks();
  const link = links.find(l => l.id === id);
  if (link) {
    if (updates.title !== undefined) link.title = updates.title;
    if (updates.description !== undefined) link.description = updates.description;
    if (updates.tags !== undefined) link.tags = updates.tags;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  }
}

export function getAllTags(): string[] {
  const links = getSavedLinks();
  const tagsSet = new Set<string>();
  links.forEach(link => link.tags.forEach(tag => tagsSet.add(tag)));
  return Array.from(tagsSet);
}

export function getLinksByTag(tag: string): SavedLink[] {
  const links = getSavedLinks();
  return links.filter(link => link.tags.includes(tag));
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
