export type ShortcutType = 'file' | 'link';

export type FileType = 'image' | 'video' | 'pdf' | 'document';

export type IconType = 'thumbnail' | 'emoji' | 'text';

export interface ShortcutIcon {
  type: IconType;
  value: string; // base64 for thumbnail, emoji character, or text
}

export interface ShortcutData {
  id: string;
  name: string;
  type: ShortcutType;
  contentUri: string; // file path or URL
  fileType?: FileType;
  icon: ShortcutIcon;
  createdAt: number;
  usageCount: number;
  // File metadata for native handling
  fileSize?: number;
  mimeType?: string;
  originalPath?: string; // Original file path for large files
  // Thumbnail for icon display (base64, small size)
  thumbnailData?: string;
}

export interface ContentSource {
  type: 'file' | 'url' | 'share';
  uri: string;
  mimeType?: string;
  name?: string;
  // For web file picker - base64 data to pass to native
  fileData?: string;
  fileSize?: number;
  // Flag for large files that shouldn't use base64
  isLargeFile?: boolean;
  // Small thumbnail for icon (base64)
  thumbnailData?: string;
}

// File size threshold for copying vs direct access (5MB)
export const FILE_SIZE_THRESHOLD = 5 * 1024 * 1024;
