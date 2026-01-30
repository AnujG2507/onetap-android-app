export type ShortcutType = 'file' | 'link' | 'contact' | 'message';

export type FileType = 'image' | 'video' | 'pdf' | 'document' | 'audio';

export type IconType = 'thumbnail' | 'emoji' | 'text' | 'platform';

export type MessageApp = 'whatsapp' | 'telegram' | 'signal' | 'slack';

export interface ShortcutIcon {
  type: IconType;
  value: string; // base64 for thumbnail, emoji character, text, or platform icon key (e.g., 'youtube', 'netflix')
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
  // PDF Resume Support
  resumeEnabled?: boolean; // Whether "Resume where I left off" is enabled for PDFs
  // Contact/Message shortcut fields
  phoneNumber?: string;        // For dial and WhatsApp/Telegram/Signal
  contactName?: string;        // Display name from contacts
  contactPhotoUri?: string;    // Contact photo for icon
  messageApp?: MessageApp;     // Which messaging app to use
  slackUserId?: string;        // For Slack DM shortcuts
  slackTeamId?: string;        // For Slack workspace
  // WhatsApp Quick Messages - optional message templates for WhatsApp shortcuts
  // Messages are drafts that open in WhatsApp for user to review and send
  // Empty array or undefined = open chat only
  quickMessages?: string[];
}

export interface ContentSource {
  type: 'file' | 'url' | 'share' | 'contact';
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
  // Contact picker result
  phoneNumber?: string;
  contactPhotoUri?: string;
}

// File size threshold for copying vs direct access (5MB for general files)
export const FILE_SIZE_THRESHOLD = 5 * 1024 * 1024;

// Video size limit - videos up to this size can have shortcuts created (100MB)
// Videos larger than this cannot have shortcuts created (Android system constraint)
export const VIDEO_CACHE_THRESHOLD = 100 * 1024 * 1024;
