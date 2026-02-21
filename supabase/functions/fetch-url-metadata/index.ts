import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- CORS ---
const ALLOWED_ORIGINS = [
  'capacitor://localhost',
  'http://localhost',
  'https://onetapapp.in',
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(allowed =>
    origin === allowed || origin.startsWith(allowed + ':')
  );
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  };
}

// --- SSRF Protection ---
const BLOCKED_HOSTNAMES = [
  'metadata.google.internal',
  'metadata.goog',
];

function isPrivateIP(hostname: string): boolean {
  // IPv6 loopback
  if (hostname === '::1' || hostname === '[::1]') return true;

  // IPv4 checks
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p))) return false;

  const [a, b] = parts;
  if (a === 127) return true;                         // 127.0.0.0/8
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 169 && b === 254) return true;             // 169.254.0.0/16 (link-local / cloud metadata)
  if (a === 0) return true;                            // 0.0.0.0/8
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
    return null; // valid
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
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
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
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  try {
    // --- JWT Authentication ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // --- Parse and validate URL ---
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const validationError = validateUrl(url);
    if (validationError) {
      return new Response(
        JSON.stringify({ error: validationError }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
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
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[fetch-url-metadata] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch metadata' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
