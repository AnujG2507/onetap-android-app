import { Filesystem, Directory } from '@capacitor/filesystem';
import type { FileType, ContentSource } from '@/types/shortcut';

// Detect file type from MIME type or extension
export function detectFileType(mimeType?: string, filename?: string): FileType {
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType === 'application/pdf') return 'pdf';
  }
  
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || '')) return 'image';
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext || '')) return 'video';
    if (ext === 'pdf') return 'pdf';
  }
  
  return 'document';
}

// Parse deep links for supported platforms
export function parseDeepLink(url: string): { platform: string; isDeepLink: boolean } {
  try {
    const urlObj = new URL(url);
    const host = urlObj.hostname.toLowerCase();
    
    if (host.includes('instagram.com')) {
      return { platform: 'Instagram', isDeepLink: true };
    }
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      return { platform: 'YouTube', isDeepLink: true };
    }
    if (host.includes('twitter.com') || host.includes('x.com')) {
      return { platform: 'Twitter/X', isDeepLink: true };
    }
    if (host.includes('tiktok.com')) {
      return { platform: 'TikTok', isDeepLink: true };
    }
    
    return { platform: 'Web', isDeepLink: false };
  } catch {
    return { platform: 'Web', isDeepLink: false };
  }
}

// Validate URL
export function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

// Get file name from path or URL
export function getContentName(source: ContentSource): string {
  if (source.name) return source.name;
  
  try {
    if (source.type === 'url' || source.type === 'share') {
      const url = new URL(source.uri);
      const { platform } = parseDeepLink(source.uri);
      if (platform !== 'Web') {
        return `${platform} Link`;
      }
      return url.hostname.replace('www.', '');
    }
    
    // Extract filename from path
    const parts = source.uri.split('/');
    const filename = parts[parts.length - 1];
    return filename.split('.')[0] || 'Shortcut';
  } catch {
    return 'Shortcut';
  }
}

// Request file from system picker (web fallback)
export async function pickFile(): Promise<ContentSource | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,application/pdf,.doc,.docx,.txt';
    
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        resolve({
          type: 'file',
          uri: URL.createObjectURL(file),
          mimeType: file.type,
          name: file.name,
        });
      } else {
        resolve(null);
      }
    };
    
    input.oncancel = () => resolve(null);
    input.click();
  });
}

// Generate thumbnail from content
export async function generateThumbnail(source: ContentSource): Promise<string | null> {
  if (source.mimeType?.startsWith('image/')) {
    // For images, use the image itself as thumbnail
    return source.uri;
  }
  
  if (source.type === 'url' || source.type === 'share') {
    // For links, we could fetch favicon but keeping it simple
    return null;
  }
  
  return null;
}
