// Platform brand colors for generating native icons
// Used by both React components and passed to Android native code

export interface PlatformColorInfo {
  bgColor: string; // Hex color for icon background
  textColor: string; // Hex color for text/symbol
  letter: string; // Single letter/symbol for icon
}

// Platform brand colors keyed by platform icon name from platformIcons.ts
export const PLATFORM_COLORS: Record<string, PlatformColorInfo> = {
  youtube: { bgColor: '#DC2626', textColor: '#FFFFFF', letter: '▶' },
  instagram: { bgColor: '#E11D48', textColor: '#FFFFFF', letter: '📷' },
  twitter: { bgColor: '#000000', textColor: '#FFFFFF', letter: '𝕏' },
  facebook: { bgColor: '#1877F2', textColor: '#FFFFFF', letter: 'f' },
  linkedin: { bgColor: '#0A66C2', textColor: '#FFFFFF', letter: 'in' },
  github: { bgColor: '#181717', textColor: '#FFFFFF', letter: '⌥' },
  reddit: { bgColor: '#FF4500', textColor: '#FFFFFF', letter: 'r' },
  tiktok: { bgColor: '#000000', textColor: '#FFFFFF', letter: '♪' },
  pinterest: { bgColor: '#BD081C', textColor: '#FFFFFF', letter: 'P' },
  spotify: { bgColor: '#1DB954', textColor: '#FFFFFF', letter: '♫' },
  twitch: { bgColor: '#9146FF', textColor: '#FFFFFF', letter: '⚡' },
  discord: { bgColor: '#5865F2', textColor: '#FFFFFF', letter: '🎮' },
  whatsapp: { bgColor: '#25D366', textColor: '#FFFFFF', letter: '💬' },
  telegram: { bgColor: '#0088CC', textColor: '#FFFFFF', letter: '✈' },
  medium: { bgColor: '#000000', textColor: '#FFFFFF', letter: 'M' },
  vimeo: { bgColor: '#1AB7EA', textColor: '#FFFFFF', letter: '▶' },
  dribbble: { bgColor: '#EA4C89', textColor: '#FFFFFF', letter: '🏀' },
  behance: { bgColor: '#1769FF', textColor: '#FFFFFF', letter: 'Bē' },
  figma: { bgColor: '#F24E1E', textColor: '#FFFFFF', letter: '◈' },
  notion: { bgColor: '#000000', textColor: '#FFFFFF', letter: 'N' },
  slack: { bgColor: '#4A154B', textColor: '#FFFFFF', letter: '#' },
  amazon: { bgColor: '#FF9900', textColor: '#000000', letter: 'a' },
  netflix: { bgColor: '#E50914', textColor: '#FFFFFF', letter: 'N' },
  'google-drive': { bgColor: '#4285F4', textColor: '#FFFFFF', letter: '△' },
  google: { bgColor: '#4285F4', textColor: '#FFFFFF', letter: 'G' },
  apple: { bgColor: '#000000', textColor: '#FFFFFF', letter: '' },
  microsoft: { bgColor: '#00A4EF', textColor: '#FFFFFF', letter: '⊞' },
  dropbox: { bgColor: '#0061FF', textColor: '#FFFFFF', letter: '📦' },
  trello: { bgColor: '#0052CC', textColor: '#FFFFFF', letter: '▣' },
  asana: { bgColor: '#F06A6A', textColor: '#FFFFFF', letter: '∞' },
  zoom: { bgColor: '#2D8CFF', textColor: '#FFFFFF', letter: '📹' },
  snapchat: { bgColor: '#FFFC00', textColor: '#000000', letter: '👻' },
};

// Get platform color info, with fallback to default blue
export function getPlatformColor(platformKey: string): PlatformColorInfo {
  return PLATFORM_COLORS[platformKey] || { 
    bgColor: '#2563EB', // primary blue
    textColor: '#FFFFFF', 
    letter: '🔗' 
  };
}
