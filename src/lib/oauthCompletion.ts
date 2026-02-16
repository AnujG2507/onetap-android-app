/**
 * Canonical OAuth Completion Utility
 * 
 * Single source of truth for OAuth completion logic.
 * Used by both useDeepLink (native) and AuthCallback (web).
 * 
 * Design principles:
 * - Fully idempotent: safe to call multiple times with same URL
 * - Deduplication: tracks processed URLs to prevent duplicate handling
 * - Cold-start safe: can recover pending OAuth on app restart
 * - Environment-safe: no hardcoded domains
 */

import { supabase } from '@/lib/supabaseClient';
import { Session } from '@supabase/supabase-js';

// Storage keys
const PENDING_OAUTH_KEY = 'pending_oauth_url';
const PROCESSED_OAUTH_KEY = 'processed_oauth_urls';
const OAUTH_TIMESTAMP_KEY = 'oauth_started_at';

// Max age for pending OAuth (5 minutes)
const PENDING_OAUTH_MAX_AGE_MS = 5 * 60 * 1000;

// Max processed URLs to track (prevent memory bloat)
const MAX_PROCESSED_URLS = 20;

export interface OAuthCompletionResult {
  success: boolean;
  session: Session | null;
  error: string | null;
  alreadyProcessed: boolean;
}

/**
 * Get the OAuth redirect URL based on environment
 * - Native: Uses the production domain or preview domain based on build
 * - Web: Uses current origin
 */
export function getOAuthRedirectUrl(): string {
  // For web, always use current origin
  if (typeof window !== 'undefined' && !isNativePlatform()) {
    return `${window.location.origin}/auth-callback`;
  }
  
  // For native, use the production domain from env
  const productionDomain = import.meta.env.VITE_PRODUCTION_DOMAIN;
  
  if (!productionDomain) {
    console.warn('[OAuth] VITE_PRODUCTION_DOMAIN is not set. OAuth redirects will fail on native.');
  }
  
  const domain = productionDomain || 'onetapapp.in';
  
  return `https://${domain}/auth-callback`;
}

/**
 * Check if running on native platform (Capacitor)
 */
function isNativePlatform(): boolean {
  try {
    // Check for Capacitor native platform indicator
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/**
 * Extract the unique identifier from an OAuth URL for deduplication
 * Uses the code parameter if present, otherwise the full URL
 */
function getOAuthUrlIdentifier(url: string): string {
  try {
    // Try to extract code from URL (query or hash)
    const urlObj = new URL(url);
    const code = urlObj.searchParams.get('code') || 
                 new URLSearchParams(urlObj.hash.substring(1)).get('code');
    return code || url;
  } catch {
    return url;
  }
}

/**
 * Check if a URL has already been processed
 */
function isUrlProcessed(url: string): boolean {
  try {
    const identifier = getOAuthUrlIdentifier(url);
    const processed = JSON.parse(localStorage.getItem(PROCESSED_OAUTH_KEY) || '[]');
    return processed.includes(identifier);
  } catch {
    return false;
  }
}

/**
 * Mark a URL as processed
 */
function markUrlProcessed(url: string): void {
  try {
    const identifier = getOAuthUrlIdentifier(url);
    const processed = JSON.parse(localStorage.getItem(PROCESSED_OAUTH_KEY) || '[]');
    
    // Add to front, limit size
    const updated = [identifier, ...processed.filter((id: string) => id !== identifier)]
      .slice(0, MAX_PROCESSED_URLS);
    
    localStorage.setItem(PROCESSED_OAUTH_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Store pending OAuth URL for cold-start recovery
 */
export function storePendingOAuth(url: string): void {
  try {
    localStorage.setItem(PENDING_OAUTH_KEY, url);
    localStorage.setItem(OAUTH_TIMESTAMP_KEY, Date.now().toString());
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get and validate pending OAuth URL for cold-start recovery
 * Returns null if expired or not present
 */
export function getPendingOAuth(): string | null {
  try {
    const url = localStorage.getItem(PENDING_OAUTH_KEY);
    const timestamp = localStorage.getItem(OAUTH_TIMESTAMP_KEY);
    
    if (!url || !timestamp) return null;
    
    // Check if expired
    const age = Date.now() - parseInt(timestamp, 10);
    if (age > PENDING_OAUTH_MAX_AGE_MS) {
      clearPendingOAuth();
      return null;
    }
    
    // Don't return if already processed
    if (isUrlProcessed(url)) {
      clearPendingOAuth();
      return null;
    }
    
    return url;
  } catch {
    return null;
  }
}

/**
 * Clear pending OAuth state
 */
export function clearPendingOAuth(): void {
  try {
    localStorage.removeItem(PENDING_OAUTH_KEY);
    localStorage.removeItem(OAUTH_TIMESTAMP_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Mark that OAuth flow has started (for cold-start recovery)
 */
export function markOAuthStarted(): void {
  try {
    localStorage.setItem(OAUTH_TIMESTAMP_KEY, Date.now().toString());
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if there's an in-progress OAuth that might need recovery
 */
export function hasInProgressOAuth(): boolean {
  try {
    const timestamp = localStorage.getItem(OAUTH_TIMESTAMP_KEY);
    if (!timestamp) return false;
    
    const age = Date.now() - parseInt(timestamp, 10);
    return age < PENDING_OAUTH_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/**
 * Complete OAuth flow - THE canonical implementation
 * 
 * This is the ONLY function that should exchange codes for sessions.
 * Both useDeepLink and AuthCallback must use this.
 * 
 * @param url - The OAuth callback URL containing code/tokens
 * @returns OAuthCompletionResult with session or error
 */
export async function completeOAuth(url: string): Promise<OAuthCompletionResult> {
  console.log('[OAuth] completeOAuth called with URL');
  
  // Check for duplicate/replay
  if (isUrlProcessed(url)) {
    console.log('[OAuth] URL already processed, skipping');
    return {
      success: false,
      session: null,
      error: null,
      alreadyProcessed: true,
    };
  }
  
  // Store for cold-start recovery before processing
  storePendingOAuth(url);
  
  try {
    // Check for error in URL first
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    const hashParams = new URLSearchParams(urlObj.hash.substring(1));
    
    const errorParam = params.get('error') || hashParams.get('error');
    const errorDescription = params.get('error_description') || hashParams.get('error_description');
    
    if (errorParam) {
      console.error('[OAuth] Error in URL:', errorParam, errorDescription);
      markUrlProcessed(url);
      clearPendingOAuth();
      return {
        success: false,
        session: null,
        error: errorDescription || errorParam,
        alreadyProcessed: false,
      };
    }
    
    // Exchange code for session
    console.log('[OAuth] Exchanging code for session...');
    const { data, error } = await supabase.auth.exchangeCodeForSession(url);
    
    if (error) {
      console.error('[OAuth] Code exchange failed:', error.message);
      // Don't mark as processed on transient errors - allow retry
      if (!isTransientError(error.message)) {
        markUrlProcessed(url);
      }
      clearPendingOAuth();
      return {
        success: false,
        session: null,
        error: error.message,
        alreadyProcessed: false,
      };
    }
    
    // Success!
    console.log('[OAuth] Session established:', data.session?.user?.email);
    markUrlProcessed(url);
    clearPendingOAuth();
    
    return {
      success: true,
      session: data.session,
      error: null,
      alreadyProcessed: false,
    };
    
  } catch (err: any) {
    console.error('[OAuth] Unexpected error:', err);
    clearPendingOAuth();
    return {
      success: false,
      session: null,
      error: err?.message || 'An unexpected error occurred',
      alreadyProcessed: false,
    };
  }
}

/**
 * Check if an error is transient (network, timeout) vs permanent
 */
function isTransientError(message: string): boolean {
  const transientPatterns = [
    'network',
    'timeout',
    'fetch',
    'connection',
    'ECONNREFUSED',
    'ETIMEDOUT',
  ];
  
  const lowerMessage = message.toLowerCase();
  return transientPatterns.some(pattern => lowerMessage.includes(pattern.toLowerCase()));
}

/**
 * Attempt cold-start OAuth recovery
 * Call this on app initialization to recover from app kill during OAuth
 * 
 * @returns OAuthCompletionResult if recovery was attempted, null if nothing to recover
 */
export async function attemptOAuthRecovery(): Promise<OAuthCompletionResult | null> {
  console.log('[OAuth] Checking for cold-start recovery...');
  
  // First, check if we already have a valid session
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    console.log('[OAuth] Already have valid session, no recovery needed');
    clearPendingOAuth();
    return null;
  }
  
  // Check for pending OAuth URL
  const pendingUrl = getPendingOAuth();
  if (!pendingUrl) {
    console.log('[OAuth] No pending OAuth to recover');
    return null;
  }
  
  console.log('[OAuth] Found pending OAuth, attempting recovery...');
  return completeOAuth(pendingUrl);
}

/**
 * Check URL for OAuth callback indicators
 */
export function isOAuthCallback(url: string): boolean {
  try {
    return url.includes('/auth-callback') && 
           (url.includes('code=') || url.includes('error='));
  } catch {
    return false;
  }
}
