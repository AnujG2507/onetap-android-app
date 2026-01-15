const STORAGE_KEY = 'saved_links';

export interface SavedLink {
  id: string;
  url: string;
  title: string;
  createdAt: number;
}

export function getSavedLinks(): SavedLink[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addSavedLink(url: string, title?: string): SavedLink {
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
    createdAt: Date.now(),
  };
  
  links.unshift(newLink);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  
  return newLink;
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
