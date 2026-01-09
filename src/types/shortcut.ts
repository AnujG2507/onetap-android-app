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
}

export interface ContentSource {
  type: 'file' | 'url' | 'share';
  uri: string;
  mimeType?: string;
  name?: string;
}
