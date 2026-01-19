// Deep link schemes that should NOT be loaded in iframe
const DEEP_LINK_SCHEMES = [
  'whatsapp://',
  'telegram://',
  'tg://',
  'signal://',
  'sgnl://',
  'slack://',
  'spotify://',
  'youtube://',
  'vnd.youtube:',
  'twitter://',
  'x://',
  'instagram://',
  'fb://',
  'messenger://',
  'snapchat://',
  'tiktok://',
  'linkedin://',
  'reddit://',
  'discord://',
  'zoom://',
  'tel:',
  'sms:',
  'mailto:',
  'geo:',
  'maps:',
  'intent://',
  'market://',
];

// Web URLs that typically redirect to apps
const APP_REDIRECT_PATTERNS = [
  'wa.me',
  't.me',
  'open.spotify.com',
  'music.apple.com',
];

// UTM and tracking parameters to remove
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'dclid',
  'twclid',
  'msclkid',
  'mc_eid',
  'oly_anon_id',
  'oly_enc_id',
  '_openstat',
  'vero_id',
  'wickedid',
  'yclid',
  'ref',
  'ref_src',
  'ref_url',
  'source',
  'feature',
  '_ga',
  '_gl',
  'si',
  'igshid',
];

// Deep link to web URL mappings
const DEEP_LINK_TO_WEB: Record<string, string> = {
  'youtube://': 'https://www.youtube.com/',
  'vnd.youtube:': 'https://www.youtube.com/',
  'instagram://': 'https://www.instagram.com/',
  'twitter://': 'https://twitter.com/',
  'x://': 'https://x.com/',
  'spotify://': 'https://open.spotify.com/',
  'fb://': 'https://www.facebook.com/',
  'messenger://': 'https://www.messenger.com/',
  'linkedin://': 'https://www.linkedin.com/',
  'reddit://': 'https://www.reddit.com/',
  'tiktok://': 'https://www.tiktok.com/',
  'discord://': 'https://discord.com/',
};

/**
 * Strip tracking/UTM parameters from a URL
 */
export function stripTrackingParams(url: string): string {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    
    // Remove tracking parameters
    TRACKING_PARAMS.forEach(param => {
      params.delete(param);
    });
    
    // Reconstruct URL
    urlObj.search = params.toString();
    return urlObj.toString();
  } catch {
    // If URL parsing fails, return original
    return url;
  }
}

/**
 * Convert a deep link to its web URL equivalent
 * Returns null if the deep link cannot be converted (e.g., tel:, mailto:)
 */
export function convertDeepLinkToWebUrl(url: string): string | null {
  const lowerUrl = url.toLowerCase();
  
  // Non-convertible schemes
  if (lowerUrl.startsWith('tel:') || 
      lowerUrl.startsWith('mailto:') || 
      lowerUrl.startsWith('sms:') ||
      lowerUrl.startsWith('geo:') ||
      lowerUrl.startsWith('maps:')) {
    return null;
  }
  
  // Handle intent:// URLs - extract browser_fallback_url
  if (lowerUrl.startsWith('intent://')) {
    const fallbackMatch = url.match(/S\.browser_fallback_url=([^;]+)/);
    if (fallbackMatch) {
      try {
        return decodeURIComponent(fallbackMatch[1]);
      } catch {
        return null;
      }
    }
    return null;
  }
  
  // Try to convert known deep link schemes
  for (const [scheme, webBase] of Object.entries(DEEP_LINK_TO_WEB)) {
    if (lowerUrl.startsWith(scheme)) {
      // Extract path after the scheme
      const path = url.substring(scheme.length);
      
      // Handle YouTube video links
      if (scheme.includes('youtube')) {
        const videoMatch = path.match(/video[/?]v=([^&]+)/);
        if (videoMatch) {
          return `https://www.youtube.com/watch?v=${videoMatch[1]}`;
        }
        // Handle channel links
        const channelMatch = path.match(/channel\/([^?&]+)/);
        if (channelMatch) {
          return `https://www.youtube.com/channel/${channelMatch[1]}`;
        }
        // Handle user links
        const userMatch = path.match(/user\/([^?&]+)/);
        if (userMatch) {
          return `https://www.youtube.com/@${userMatch[1]}`;
        }
      }
      
      // Handle Instagram user links
      if (scheme === 'instagram://') {
        const userMatch = path.match(/user\?username=([^&]+)/);
        if (userMatch) {
          return `https://www.instagram.com/${userMatch[1]}`;
        }
      }
      
      // Handle Twitter/X user links
      if (scheme === 'twitter://' || scheme === 'x://') {
        const userMatch = path.match(/user\?screen_name=([^&]+)/);
        if (userMatch) {
          return `https://twitter.com/${userMatch[1]}`;
        }
      }
      
      // Handle Spotify links
      if (scheme === 'spotify://') {
        // spotify://track/xxx -> open.spotify.com/track/xxx
        return webBase + path;
      }
      
      // Default: just append path to web base
      return webBase + path;
    }
  }
  
  return null;
}

/**
 * Check if URL is a deep link (non-web URL that opens apps directly)
 */
export function isDeepLink(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  
  // Check against known deep link schemes
  if (DEEP_LINK_SCHEMES.some(scheme => lowerUrl.startsWith(scheme))) {
    return true;
  }
  
  // Check if it's NOT a standard web URL but has a scheme
  if (!lowerUrl.startsWith('http://') && !lowerUrl.startsWith('https://')) {
    // Has a scheme but not http/https = likely a deep link
    if (lowerUrl.includes('://') || lowerUrl.startsWith('tel:') || lowerUrl.startsWith('mailto:') || lowerUrl.startsWith('sms:')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if URL is a web URL that typically redirects to an app
 * These can be loaded in iframe but user should know they work better externally
 */
export function isAppRedirectUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return APP_REDIRECT_PATTERNS.some(pattern => lowerUrl.includes(pattern));
}

/**
 * Get a friendly app name from the URL for display purposes
 */
export function getAppNameFromUrl(url: string): string | null {
  const lowerUrl = url.toLowerCase();
  
  const appMap: Record<string, string> = {
    'whatsapp://': 'WhatsApp',
    'wa.me': 'WhatsApp',
    'telegram://': 'Telegram',
    'tg://': 'Telegram',
    't.me': 'Telegram',
    'signal://': 'Signal',
    'sgnl://': 'Signal',
    'spotify://': 'Spotify',
    'open.spotify.com': 'Spotify',
    'youtube://': 'YouTube',
    'youtu.be': 'YouTube',
    'youtube.com': 'YouTube',
    'twitter://': 'Twitter/X',
    'x://': 'Twitter/X',
    'twitter.com': 'Twitter/X',
    'x.com': 'Twitter/X',
    'instagram://': 'Instagram',
    'instagram.com': 'Instagram',
    'fb://': 'Facebook',
    'facebook.com': 'Facebook',
    'messenger://': 'Messenger',
    'slack://': 'Slack',
    'zoom://': 'Zoom',
    'zoom.us': 'Zoom',
    'discord://': 'Discord',
    'discord.com': 'Discord',
    'discord.gg': 'Discord',
    'linkedin://': 'LinkedIn',
    'linkedin.com': 'LinkedIn',
    'reddit://': 'Reddit',
    'reddit.com': 'Reddit',
    'tiktok://': 'TikTok',
    'tiktok.com': 'TikTok',
    'music.apple.com': 'Apple Music',
    'tel:': 'Phone',
    'mailto:': 'Email',
    'sms:': 'Messages',
  };
  
  for (const [pattern, name] of Object.entries(appMap)) {
    if (lowerUrl.includes(pattern)) {
      return name;
    }
  }
  
  return null;
}

/**
 * Check if a URL can be safely loaded in an iframe
 * Returns false for deep links that would try to open external apps
 */
export function canLoadInIframe(url: string): boolean {
  return !isDeepLink(url);
}
