// Platform detection and icon configuration for bookmarks
// Returns platform name, colors, and icon details for recognized URLs

export interface PlatformInfo {
  name: string;
  bgColor: string;
  textColor: string;
  icon: 'youtube' | 'instagram' | 'twitter' | 'facebook' | 'linkedin' | 'github' | 'reddit' | 'tiktok' | 'pinterest' | 'spotify' | 'twitch' | 'discord' | 'whatsapp' | 'telegram' | 'medium' | 'vimeo' | 'dribbble' | 'behance' | 'figma' | 'notion' | 'slack' | 'amazon' | 'netflix' | 'google-drive' | 'google' | 'apple' | 'microsoft' | 'dropbox' | 'trello' | 'asana' | 'zoom' | 'snapchat' | null;
}

interface PlatformPattern {
  pattern: RegExp;
  info: PlatformInfo;
}

const PLATFORM_PATTERNS: PlatformPattern[] = [
  {
    pattern: /(?:youtube\.com|youtu\.be)/i,
    info: { name: 'YouTube', bgColor: 'bg-red-600', textColor: 'text-white', icon: 'youtube' }
  },
  {
    pattern: /(?:instagram\.com|instagr\.am)/i,
    info: { name: 'Instagram', bgColor: 'bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400', textColor: 'text-white', icon: 'instagram' }
  },
  {
    pattern: /(?:twitter\.com|x\.com)/i,
    info: { name: 'X', bgColor: 'bg-black', textColor: 'text-white', icon: 'twitter' }
  },
  {
    pattern: /facebook\.com/i,
    info: { name: 'Facebook', bgColor: 'bg-blue-600', textColor: 'text-white', icon: 'facebook' }
  },
  {
    pattern: /linkedin\.com/i,
    info: { name: 'LinkedIn', bgColor: 'bg-blue-700', textColor: 'text-white', icon: 'linkedin' }
  },
  {
    pattern: /github\.com/i,
    info: { name: 'GitHub', bgColor: 'bg-gray-900', textColor: 'text-white', icon: 'github' }
  },
  {
    pattern: /reddit\.com/i,
    info: { name: 'Reddit', bgColor: 'bg-orange-600', textColor: 'text-white', icon: 'reddit' }
  },
  {
    pattern: /tiktok\.com/i,
    info: { name: 'TikTok', bgColor: 'bg-black', textColor: 'text-white', icon: 'tiktok' }
  },
  {
    pattern: /pinterest\.com/i,
    info: { name: 'Pinterest', bgColor: 'bg-red-700', textColor: 'text-white', icon: 'pinterest' }
  },
  {
    pattern: /spotify\.com/i,
    info: { name: 'Spotify', bgColor: 'bg-green-600', textColor: 'text-white', icon: 'spotify' }
  },
  {
    pattern: /twitch\.tv/i,
    info: { name: 'Twitch', bgColor: 'bg-purple-600', textColor: 'text-white', icon: 'twitch' }
  },
  {
    pattern: /discord\.com|discord\.gg/i,
    info: { name: 'Discord', bgColor: 'bg-indigo-600', textColor: 'text-white', icon: 'discord' }
  },
  {
    pattern: /whatsapp\.com|wa\.me/i,
    info: { name: 'WhatsApp', bgColor: 'bg-green-500', textColor: 'text-white', icon: 'whatsapp' }
  },
  {
    pattern: /(?:telegram\.org|t\.me)/i,
    info: { name: 'Telegram', bgColor: 'bg-sky-500', textColor: 'text-white', icon: 'telegram' }
  },
  {
    pattern: /medium\.com/i,
    info: { name: 'Medium', bgColor: 'bg-black', textColor: 'text-white', icon: 'medium' }
  },
  {
    pattern: /vimeo\.com/i,
    info: { name: 'Vimeo', bgColor: 'bg-cyan-500', textColor: 'text-white', icon: 'vimeo' }
  },
  {
    pattern: /dribbble\.com/i,
    info: { name: 'Dribbble', bgColor: 'bg-pink-500', textColor: 'text-white', icon: 'dribbble' }
  },
  {
    pattern: /behance\.net/i,
    info: { name: 'Behance', bgColor: 'bg-blue-600', textColor: 'text-white', icon: 'behance' }
  },
  {
    pattern: /figma\.com/i,
    info: { name: 'Figma', bgColor: 'bg-purple-500', textColor: 'text-white', icon: 'figma' }
  },
  {
    pattern: /notion\.so|notion\.site/i,
    info: { name: 'Notion', bgColor: 'bg-gray-900', textColor: 'text-white', icon: 'notion' }
  },
  {
    pattern: /slack\.com/i,
    info: { name: 'Slack', bgColor: 'bg-purple-700', textColor: 'text-white', icon: 'slack' }
  },
  {
    pattern: /amazon\.com|amazon\.\w{2,3}|amzn\.to/i,
    info: { name: 'Amazon', bgColor: 'bg-amber-500', textColor: 'text-black', icon: 'amazon' }
  },
  {
    pattern: /netflix\.com/i,
    info: { name: 'Netflix', bgColor: 'bg-red-600', textColor: 'text-white', icon: 'netflix' }
  },
  {
    pattern: /drive\.google\.com/i,
    info: { name: 'Google Drive', bgColor: 'bg-yellow-500', textColor: 'text-black', icon: 'google-drive' }
  },
  {
    pattern: /docs\.google\.com|sheets\.google\.com|slides\.google\.com/i,
    info: { name: 'Google Docs', bgColor: 'bg-blue-500', textColor: 'text-white', icon: 'google' }
  },
  {
    pattern: /google\.com/i,
    info: { name: 'Google', bgColor: 'bg-white', textColor: 'text-gray-700', icon: 'google' }
  },
  {
    pattern: /apple\.com/i,
    info: { name: 'Apple', bgColor: 'bg-gray-900', textColor: 'text-white', icon: 'apple' }
  },
  {
    pattern: /microsoft\.com|office\.com|live\.com|outlook\.com/i,
    info: { name: 'Microsoft', bgColor: 'bg-blue-600', textColor: 'text-white', icon: 'microsoft' }
  },
  {
    pattern: /dropbox\.com/i,
    info: { name: 'Dropbox', bgColor: 'bg-blue-500', textColor: 'text-white', icon: 'dropbox' }
  },
  {
    pattern: /trello\.com/i,
    info: { name: 'Trello', bgColor: 'bg-blue-600', textColor: 'text-white', icon: 'trello' }
  },
  {
    pattern: /asana\.com/i,
    info: { name: 'Asana', bgColor: 'bg-rose-500', textColor: 'text-white', icon: 'asana' }
  },
  {
    pattern: /zoom\.us/i,
    info: { name: 'Zoom', bgColor: 'bg-blue-500', textColor: 'text-white', icon: 'zoom' }
  },
  {
    pattern: /snapchat\.com/i,
    info: { name: 'Snapchat', bgColor: 'bg-yellow-400', textColor: 'text-black', icon: 'snapchat' }
  },
];

export function detectPlatform(url: string): PlatformInfo | null {
  for (const { pattern, info } of PLATFORM_PATTERNS) {
    if (pattern.test(url)) {
      return info;
    }
  }
  return null;
}
