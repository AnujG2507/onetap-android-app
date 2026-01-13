import { Filesystem, Directory } from '@capacitor/filesystem';
import type { FileType, ContentSource } from '@/types/shortcut';

// Maximum file size for base64 encoding (≈14MB). Base64 expands size ~33%, so this stays under native limits.
const MAX_BASE64_SIZE = 14 * 1024 * 1024;

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

// Convert file to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Generate a thumbnail for an image (scaled down for icon use)
async function generateImageThumbnail(file: File, maxSize: number = 512): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
      // Calculate scaled dimensions
      let width = img.width;
      let height = img.height;
      
      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        // Get as JPEG for smaller size
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl);
      } else {
        resolve(null);
      }
      
      URL.revokeObjectURL(img.src);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(null);
    };
    
    img.src = URL.createObjectURL(file);
  });
}

// Request file from system picker (web fallback)
// Handles large files by skipping base64 encoding
export async function pickFile(): Promise<ContentSource | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,application/pdf,.doc,.docx,.txt';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        console.log('[ContentResolver] File picked:', file.name, 'size:', file.size, 'type:', file.type);
        
        const isVideo = file.type.startsWith('video/');
        const isLargeFile = file.size > MAX_BASE64_SIZE;
        const isImage = file.type.startsWith('image/');

        // For large videos/files, skip base64 encoding to prevent OOM.
        // For small/medium videos (<= ~14MB), we DO base64 so native can cache into app storage.
        if (isLargeFile) {
          console.log('[ContentResolver] Large file - skipping base64 encoding');

          // For images, still generate a small thumbnail for the icon
          let thumbnailData: string | undefined;
          if (isImage) {
            const thumbnail = await generateImageThumbnail(file, 256);
            if (thumbnail) {
              // Remove the data URL prefix for base64
              thumbnailData = thumbnail.split(',')[1];
            }
          }

          resolve({
            type: 'file',
            uri: URL.createObjectURL(file),
            mimeType: file.type,
            name: file.name,
            fileSize: file.size,
            isLargeFile: true,
            thumbnailData,
          });
          return;
        }
        
        try {
          // Read file as base64 for native handling (small files only)
          const base64Data = await fileToBase64(file);
          console.log('[ContentResolver] File converted to base64, length:', base64Data.length);
          
          // Generate thumbnail for images
          let thumbnailData: string | undefined;
          if (isImage) {
            const thumbnail = await generateImageThumbnail(file, 256);
            if (thumbnail) {
              thumbnailData = thumbnail.split(',')[1];
            }
          }
          
          resolve({
            type: 'file',
            uri: URL.createObjectURL(file), // Still useful for preview
            mimeType: file.type,
            name: file.name,
            fileData: base64Data,
            fileSize: file.size,
            thumbnailData,
          });
        } catch (error) {
          console.error('[ContentResolver] Error reading file:', error);
          // Fallback without base64
          resolve({
            type: 'file',
            uri: URL.createObjectURL(file),
            mimeType: file.type,
            name: file.name,
            fileSize: file.size,
            isLargeFile: true,
          });
        }
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

// Get human-readable file size
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
