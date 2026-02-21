import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// --- CORS ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// --- Rate Limiting (in-memory, per-IP) ---
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30;  // max requests per window per IP

const ipRequestCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipRequestCounts.get(ip);

  if (!entry || now >= entry.resetAt) {
    ipRequestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

// Periodic cleanup of stale entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipRequestCounts) {
    if (now >= entry.resetAt) {
      ipRequestCounts.delete(ip);
    }
  }
}, 5 * 60_000);

// --- SSRF Protection ---
const BLOCKED_HOSTNAMES = [
  'metadata.google.internal',
  'metadata.goog',
];

function isPrivateIP(hostname: string): boolean {
  if (hostname === '::1' || hostname === '[::1]') return true;
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  return false;
}

function validateUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Only http and https URLs are allowed';
    }
    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return 'Access to this host is not allowed';
    }
    if (isPrivateIP(hostname) || hostname === 'localhost') {
      return 'Access to private/internal addresses is not allowed';
    }
    return null;
  } catch {
    return 'Invalid URL';
  }
}

// --- Metadata extraction ---
interface MetadataResponse {
  title: string | null;
  favicon: string | null;
  domain: string;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function extractTitle(html: string): string | null {
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (ogTitleMatch?.[1]) return ogTitleMatch[1].trim();
  const twitterTitleMatch = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i);
  if (twitterTitleMatch?.[1]) return twitterTitleMatch[1].trim();
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) return titleMatch[1].trim();
  return null;
}

function extractFavicon(html: string, baseUrl: string): string | null {
  try {
    const urlObj = new URL(baseUrl);
    const origin = urlObj.origin;

    const appleTouchMatch = html.match(/<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i);
    if (appleTouchMatch?.[1]) {
      const href = appleTouchMatch[1];
      return href.startsWith('http') ? href : new URL(href, origin).href;
    }

    const iconSizesMatch = html.match(/<link[^>]*rel=["']icon["'][^>]*sizes=["'](\d+)x\d+["'][^>]*href=["']([^"']+)["']/i);
    if (iconSizesMatch?.[2]) {
      const href = iconSizesMatch[2];
      return href.startsWith('http') ? href : new URL(href, origin).href;
    }

    const shortcutMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i);
    if (shortcutMatch?.[1]) {
      const href = shortcutMatch[1];
      return href.startsWith('http') ? href : new URL(href, origin).href;
    }

    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
  } catch {
    return null;
  }
}

// --- Handler ---
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Rate Limiting ---
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';

    if (isRateLimited(clientIP)) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Parse and validate URL ---
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validationError = validateUrl(url);
    if (validationError) {
      return new Response(
        JSON.stringify({ error: validationError }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const domain = extractDomain(url);
    let title: string | null = null;
    let favicon: string | null = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OneTapBot/1.0)',
          'Accept': 'text/html',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const html = await response.text();
        title = extractTitle(html);
        favicon = extractFavicon(html, url);
      }
    } catch (fetchError) {
      console.log('[fetch-url-metadata] Failed to fetch URL:', fetchError);
      try {
        const urlObj = new URL(url);
        favicon = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
      } catch {
        // Ignore
      }
    }

    const result: MetadataResponse = { title, favicon, domain };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[fetch-url-metadata] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch metadata' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
