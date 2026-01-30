import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import type { FileType, ContentSource } from '@/types/shortcut';
import { VIDEO_CACHE_THRESHOLD } from '@/types/shortcut';
import { detectPlatform, type PlatformInfo } from '@/lib/platformIcons';

// Maximum file size for base64 encoding - matches VIDEO_CACHE_THRESHOLD (50MB)
// Videos larger than this cannot have shortcuts created
const MAX_BASE64_SIZE = VIDEO_CACHE_THRESHOLD;

// Detect file type from MIME type or extension
export function detectFileType(mimeType?: string, filename?: string): FileType {
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'pdf';
  }
  
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || '')) return 'image';
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext || '')) return 'video';
    if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'wma', 'aiff', 'opus', 'm4b', 'aa', 'aax'].includes(ext || '')) return 'audio';
    if (ext === 'pdf') return 'pdf';
  }
  
  return 'document';
}

// Platform icon key to emoji fallback mapping (used when branded icons unavailable)
const PLATFORM_EMOJI_MAP: Record<string, string> = {
  youtube: '▶️',
  instagram: '📷',
  twitter: '🐦',
  facebook: '👤',
  linkedin: '💼',
  github: '💻',
  reddit: '🔶',
  tiktok: '🎵',
  pinterest: '📌',
  spotify: '🎵',
  twitch: '🎮',
  discord: '💬',
  whatsapp: '💬',
  telegram: '✈️',
  medium: '📝',
  vimeo: '🎞️',
  dribbble: '🎨',
  behance: '🎨',
  figma: '🎨',
  notion: '📝',
  slack: '💬',
  amazon: '📦',
  netflix: '🎬',
  'google-drive': '📁',
  google: '🔍',
  apple: '🍎',
  microsoft: '🪟',
  dropbox: '📦',
  trello: '📋',
  asana: '✅',
  zoom: '📹',
  snapchat: '👻',
};

// Parse deep links for supported platforms - uses consolidated detection
export function parseDeepLink(url: string): { platform: string; isDeepLink: boolean } {
  const platformInfo = detectPlatform(url);
  if (platformInfo) {
    return { platform: platformInfo.name, isDeepLink: true };
  }
  return { platform: 'Web', isDeepLink: false };
}

// Get platform-specific emoji for a URL - uses consolidated detection
export function getPlatformEmoji(url: string): string {
  const platformInfo = detectPlatform(url);
  if (platformInfo?.icon && PLATFORM_EMOJI_MAP[platformInfo.icon]) {
    return PLATFORM_EMOJI_MAP[platformInfo.icon];
  }
  return '🔗'; // default
}

// Get detected platform info for a URL (for platform icon type)
export function getDetectedPlatform(url: string): PlatformInfo | null {
  return detectPlatform(url);
}

// Validate URL - must have valid protocol and proper domain structure
export function isValidUrl(string: string): boolean {
  let url: URL;
  try {
    url = new URL(string);
  } catch {
    return false;
  }
  
  // Only allow http and https protocols
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }
  
  const hostname = url.hostname;
  if (!hostname || hostname.length === 0) {
    return false;
  }
  
  // Check for valid domain structure:
  // - Must contain at least one dot (e.g., google.com, sub.example.org)
  // - OR be localhost for development
  // - OR be an IP address
  const isLocalhost = hostname === 'localhost';
  const isIPAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  const hasDomain = hostname.includes('.') && 
    !hostname.startsWith('.') && 
    !hostname.endsWith('.') &&
    hostname.split('.').pop()!.length >= 2;
  
  return isLocalhost || isIPAddress || hasDomain;
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

// Request file from system picker
// - On native Android: uses a native document picker to obtain a persistent content:// URI (no base64 → avoids crashes).
// - On web: falls back to <input type="file"> and (for small files) base64 encoding.
export type FileTypeFilter = 'image' | 'video' | 'document' | 'audio' | 'all';

function getMimeTypesForFilter(filter: FileTypeFilter): string[] {
  switch (filter) {
    case 'image':
      return ['image/*'];
    case 'video':
      return ['video/*'];
    case 'audio':
      return ['audio/*'];
    case 'document':
      // Accept all document types except images, videos, and audio
      return [
        'application/pdf',
        'text/*',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-excel',
        'application/vnd.ms-powerpoint',
        'application/vnd.oasis.opendocument.text',
        'application/vnd.oasis.opendocument.spreadsheet',
        'application/vnd.oasis.opendocument.presentation',
        'application/rtf',
        'application/zip',
        'application/x-rar-compressed',
        'application/x-7z-compressed',
        'application/json',
        'application/xml',
        'application/octet-stream', // Generic binary for unknown doc types
      ];
    case 'all':
    default:
      return ['video/*', 'image/*', 'audio/*', 'application/pdf', 'text/plain', '*/*'];
  }
}

function getAcceptForFilter(filter: FileTypeFilter): string {
  switch (filter) {
    case 'image':
      return 'image/*';
    case 'video':
      return 'video/*';
    case 'audio':
      return 'audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.wma,.aiff,.opus,.m4b,.aa,.aax';
    case 'document':
      // Accept all common document extensions except images, videos, and audio
      return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.odt,.ods,.odp,.csv,.json,.xml,.zip,.rar,.7z,.md,.html,.css,.js,.ts,.py,.java,.c,.cpp,.h,.sql,.yaml,.yml,.ini,.conf,.log,.epub,.mobi';
    case 'all':
    default:
      return 'image/*,video/*,audio/*,application/pdf,.doc,.docx,.txt,*/*';
  }
}

export async function pickFile(filter: FileTypeFilter = 'all'): Promise<ContentSource | null> {
  // Native path (Android): get a persistent content:// URI.
  if (Capacitor.isNativePlatform()) {
    try {
      const picked = await ShortcutPlugin.pickFile({
        mimeTypes: getMimeTypesForFilter(filter),
      });

      if (!picked?.success || !picked.uri) {
        // user cancelled or picker failed
        return null;
      }

      return {
        type: 'file',
        uri: picked.uri,
        mimeType: picked.mimeType,
        name: picked.name,
        fileSize: picked.size,
        // Mark large videos so native can decide internal vs external player.
        isLargeFile: typeof picked.size === 'number' ? picked.size > VIDEO_CACHE_THRESHOLD : undefined,
      };
    } catch (e) {
      console.warn('[ContentResolver] Native pickFile failed, falling back to web picker:', e);
      // Continue to web fallback below.
    }
  }

  // Web fallback
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = getAcceptForFilter(filter);

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        console.log('[ContentResolver] File picked:', file.name, 'size:', file.size, 'type:', file.type);

        const isVideo = file.type.startsWith('video/');
        const isLargeFile = file.size > MAX_BASE64_SIZE;
        const isImage = file.type.startsWith('image/');

        // For large videos/files, skip base64 encoding to prevent OOM.
        // For small/medium videos (<= MAX_BASE64_SIZE), we DO base64 so native can cache into app storage.
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

// Extract YouTube video ID from various URL formats
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&]+)/,
    /(?:youtu\.be\/)([^?]+)/,
    /(?:youtube\.com\/embed\/)([^?]+)/,
    /(?:youtube\.com\/v\/)([^?]+)/,
    /(?:youtube\.com\/shorts\/)([^?]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Get YouTube thumbnail URL
export function getYouTubeThumbnailUrl(url: string): string | null {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;
  
  // hqdefault is 480x360, good balance of quality and size
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

// Generate thumbnail from local video file using HTML5 video element
async function generateVideoThumbnail(videoUri: string): Promise<string | null> {
  // On native with content:// URIs, skip frontend thumbnail generation
  // Let the native side handle it via MediaMetadataRetriever (it's more reliable)
  if (Capacitor.isNativePlatform() && videoUri.startsWith('content://')) {
    console.log('[ContentResolver] Skipping frontend video thumbnail for content:// URI - native will handle it');
    return null;
  }

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    
    let resolved = false;
    let objectUrl: string | null = null;
    
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };
    
    // Strict 3-second timeout to prevent hanging
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.warn('[ContentResolver] Video thumbnail timeout - aborting');
        cleanup();
        resolve(null);
      }
    }, 3000);
    
    video.onloadeddata = () => {
      if (resolved) return;
      // Seek to 1 second or 10% of duration, whichever is smaller
      const seekTime = Math.min(1, video.duration * 0.1);
      video.currentTime = seekTime;
    };
    
    video.onseeked = () => {
      if (resolved) return;
      try {
        // Create canvas and draw video frame
        const canvas = document.createElement('canvas');
        const size = 256; // Thumbnail size
        canvas.width = size;
        canvas.height = size;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          clearTimeout(timeout);
          cleanup();
          resolve(null);
          return;
        }
        
        // Calculate dimensions to maintain aspect ratio (center crop)
        const aspectRatio = video.videoWidth / video.videoHeight;
        let drawWidth = size;
        let drawHeight = size;
        let offsetX = 0;
        let offsetY = 0;
        
        if (aspectRatio > 1) {
          // Wider than tall - fit height, crop width
          drawWidth = size * aspectRatio;
          offsetX = (size - drawWidth) / 2;
        } else {
          // Taller than wide - fit width, crop height
          drawHeight = size / aspectRatio;
          offsetY = (size - drawHeight) / 2;
        }
        
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
        
        // Convert to base64 data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        clearTimeout(timeout);
        cleanup();
        resolve(dataUrl);
      } catch (e) {
        console.warn('[ContentResolver] Error capturing video frame:', e);
        clearTimeout(timeout);
        cleanup();
        resolve(null);
      }
    };
    
    video.onerror = () => {
      console.warn('[ContentResolver] Error loading video for thumbnail');
      clearTimeout(timeout);
      cleanup();
      resolve(null);
    };
    
    // Handle blob: URLs directly, otherwise create object URL
    if (videoUri.startsWith('blob:')) {
      video.src = videoUri;
    } else if (videoUri.startsWith('http') || videoUri.startsWith('file:')) {
      video.src = videoUri;
    } else {
      // Try to load directly
      video.src = videoUri;
    }
    video.load();
  });
}

// Check if URL is a Vimeo video
function isVimeoUrl(url: string): boolean {
  return /(?:vimeo\.com\/(?:video\/)?(\d+)|player\.vimeo\.com\/video\/(\d+))/.test(url);
}

// Get Vimeo thumbnail URL using oEmbed API
async function getVimeoThumbnailUrl(url: string): Promise<string | null> {
  if (!isVimeoUrl(url)) return null;
  
  try {
    const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl);
    
    if (!response.ok) {
      console.warn('[ContentResolver] Vimeo oEmbed request failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    return data.thumbnail_url || null;
  } catch (e) {
    console.warn('[ContentResolver] Error fetching Vimeo oEmbed:', e);
    return null;
  }
}

// Helper to fetch image and convert to base64
async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn('[ContentResolver] Failed to fetch image:', response.status);
      return null;
    }
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('[ContentResolver] Error fetching image:', e);
    return null;
  }
}

// Check if the app is currently online
function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// Generate thumbnail from content
export async function generateThumbnail(source: ContentSource): Promise<string | null> {
  if (source.mimeType?.startsWith('image/')) {
    // For images, use the image itself as thumbnail
    return source.uri;
  }
  
  // Handle local video files - extract first frame
  if (source.mimeType?.startsWith('video/') && source.type === 'file') {
    console.log('[ContentResolver] Generating video thumbnail for:', source.name);
    return generateVideoThumbnail(source.uri);
  }
  
  if (source.type === 'url' || source.type === 'share') {
    // Skip network requests when offline to avoid timeouts
    if (!isOnline()) {
      console.log('[ContentResolver] Offline - skipping thumbnail fetch for URL');
      return null;
    }
    
    // Try YouTube thumbnail first
    const ytThumbnail = getYouTubeThumbnailUrl(source.uri);
    if (ytThumbnail) {
      const base64 = await fetchImageAsBase64(ytThumbnail);
      if (base64) return base64;
    }
    
    // Try Vimeo thumbnail
    const vimeoThumbnail = await getVimeoThumbnailUrl(source.uri);
    if (vimeoThumbnail) {
      const base64 = await fetchImageAsBase64(vimeoThumbnail);
      if (base64) return base64;
    }
    
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

// File type emojis for smart icon selection
const FILE_TYPE_EMOJIS: Record<FileType, string> = {
  image: '🖼️',
  video: '🎬',
  pdf: '📄',
  document: '📑',
  audio: '🎵',
};

// Document-specific emojis based on MIME type or extension
const DOCUMENT_TYPE_EMOJIS: Record<string, string> = {
  // Spreadsheets
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
  'application/vnd.oasis.opendocument.spreadsheet': '📊',
  '.xls': '📊',
  '.xlsx': '📊',
  '.csv': '📊',
  '.ods': '📊',
  
  // Presentations
  'application/vnd.ms-powerpoint': '📽️',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📽️',
  'application/vnd.oasis.opendocument.presentation': '📽️',
  '.ppt': '📽️',
  '.pptx': '📽️',
  '.odp': '📽️',
  
  // Word documents
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.oasis.opendocument.text': '📝',
  'application/rtf': '📝',
  '.doc': '📝',
  '.docx': '📝',
  '.odt': '📝',
  '.rtf': '📝',
  
  // PDF
  'application/pdf': '📄',
  '.pdf': '📄',
  
  // Plain text
  'text/plain': '📃',
  '.txt': '📃',
  '.md': '📃',
  '.log': '📃',
  
  // Web/HTML
  'text/html': '🌐',
  '.html': '🌐',
  '.htm': '🌐',
  
  // Code files
  'text/css': '🎨',
  'text/javascript': '💻',
  'application/javascript': '💻',
  'application/json': '💻',
  'application/xml': '💻',
  'text/xml': '💻',
  '.css': '🎨',
  '.js': '💻',
  '.ts': '💻',
  '.jsx': '💻',
  '.tsx': '💻',
  '.json': '💻',
  '.xml': '💻',
  '.py': '💻',
  '.java': '💻',
  '.c': '💻',
  '.cpp': '💻',
  '.h': '💻',
  '.sql': '💻',
  '.yaml': '💻',
  '.yml': '💻',
  
  // Archives
  'application/zip': '📦',
  'application/x-rar-compressed': '📦',
  'application/x-7z-compressed': '📦',
  '.zip': '📦',
  '.rar': '📦',
  '.7z': '📦',
  
  // E-books
  'application/epub+zip': '📚',
  '.epub': '📚',
  '.mobi': '📚',
  
  // Config files
  '.ini': '⚙️',
  '.conf': '⚙️',
  '.env': '⚙️',
  
  // Audio files - Music
  'audio/mpeg': '🎵',
  'audio/mp3': '🎵',
  'audio/mp4': '🎵',
  'audio/m4a': '🎵',
  'audio/aac': '🎵',
  'audio/flac': '🎵',
  'audio/ogg': '🎵',
  'audio/x-m4a': '🎵',
  'audio/x-flac': '🎵',
  '.mp3': '🎵',
  '.m4a': '🎵',
  '.aac': '🎵',
  '.flac': '🎵',
  '.ogg': '🎵',
  '.wma': '🎵',
  '.opus': '🎵',
  
  // Audio files - Raw/Lossless
  'audio/wav': '🔊',
  'audio/x-wav': '🔊',
  'audio/aiff': '🔊',
  'audio/x-aiff': '🔊',
  '.wav': '🔊',
  '.aiff': '🔊',
  
  // Audiobooks
  '.m4b': '📻',
  '.aa': '📻',
  '.aax': '📻',
};

// Get emoji for a file type with document-specific detection
export function getFileTypeEmoji(mimeType?: string, filename?: string): string {
  const fileType = detectFileType(mimeType, filename);
  
  // For images and videos, use simple mapping
  if (fileType === 'image') return '🖼️';
  if (fileType === 'video') return '🎬';
  
  // For audio, check for specific types (podcast, audiobook, voice recording)
  if (fileType === 'audio') {
    if (filename) {
      const ext = '.' + (filename.split('.').pop()?.toLowerCase() || '');
      const lowerName = filename.toLowerCase();
      
      // Check for audiobook extensions
      if (['.m4b', '.aa', '.aax'].includes(ext)) return '📻';
      
      // Check for podcast pattern in filename
      if (lowerName.includes('podcast') || lowerName.includes('episode')) return '🎙️';
      
      // Check for voice recording patterns
      if (lowerName.includes('voice') || lowerName.includes('recording') || lowerName.includes('memo')) return '🎤';
      
      // Check for raw/lossless audio
      if (['.wav', '.aiff'].includes(ext)) return '🔊';
    }
    return '🎵'; // Default music emoji
  }
  
  // For documents/PDFs, check specific MIME type first
  if (mimeType && DOCUMENT_TYPE_EMOJIS[mimeType]) {
    return DOCUMENT_TYPE_EMOJIS[mimeType];
  }
  
  // Fall back to extension-based lookup
  if (filename) {
    const ext = '.' + (filename.split('.').pop()?.toLowerCase() || '');
    if (DOCUMENT_TYPE_EMOJIS[ext]) {
      return DOCUMENT_TYPE_EMOJIS[ext];
    }
  }
  
  // Default for unknown documents
  return fileType === 'pdf' ? '📄' : '📑';
}

// Format content source info for display
export function formatContentInfo(source: ContentSource): {
  label: string;
  sublabel: string;
  emoji: string;
} {
  if (source.type === 'url' || source.type === 'share') {
    const { platform } = parseDeepLink(source.uri);
    const emoji = getPlatformEmoji(source.uri);
    try {
      const url = new URL(source.uri);
      return {
        label: platform !== 'Web' ? `${platform} link` : 'Web link',
        sublabel: url.hostname.replace('www.', ''),
        emoji,
      };
    } catch {
      return { label: 'Link', sublabel: source.uri, emoji };
    }
  }

  const fileType = detectFileType(source.mimeType, source.name);
  const emoji = FILE_TYPE_EMOJIS[fileType];
  const typeLabel = fileType.charAt(0).toUpperCase() + fileType.slice(1);
  const sizeLabel = source.fileSize ? formatFileSize(source.fileSize) : '';

  return {
    label: source.name || 'File',
    sublabel: sizeLabel ? `${typeLabel} • ${sizeLabel}` : typeLabel,
    emoji,
  };
}
