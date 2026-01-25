/**
 * Crash Reporting Service
 * 
 * This provides a wrapper for crash reporting that can be connected to
 * Firebase Crashlytics or other crash reporting services.
 * 
 * Currently implements a no-op version that logs to console.
 * To enable Firebase Crashlytics:
 * 1. Create a Firebase project at https://console.firebase.google.com
 * 2. Add your Android app and download google-services.json
 * 3. Place google-services.json in native/android/app/
 * 4. Install @capacitor-firebase/crashlytics
 * 5. Update this file to use the real Crashlytics SDK
 */

import { Capacitor } from '@capacitor/core';

interface Breadcrumb {
  category: string;
  message: string;
  timestamp: number;
}

class CrashReportingService {
  private initialized = false;
  private userId: string | null = null;
  private breadcrumbs: Breadcrumb[] = [];
  private maxBreadcrumbs = 50;

  /**
   * Initialize the crash reporting service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // In production with Firebase configured, this would initialize Crashlytics
      // For now, we just mark as initialized
      this.initialized = true;
      
      if (Capacitor.isNativePlatform()) {
        console.log('[CrashReporting] Initialized (native platform detected)');
      } else {
        console.log('[CrashReporting] Initialized (web fallback mode)');
      }

      // Add initial breadcrumb
      this.addBreadcrumb('app', 'Crash reporting initialized');
    } catch (error) {
      console.error('[CrashReporting] Failed to initialize:', error);
    }
  }

  /**
   * Log a message for debugging context
   */
  log(message: string): void {
    if (!this.initialized) return;
    
    console.log(`[CrashReporting] Log: ${message}`);
    // In production: Crashlytics.log({ message });
  }

  /**
   * Record a non-fatal error
   */
  recordError(error: Error, context?: Record<string, string>): void {
    if (!this.initialized) return;

    console.error('[CrashReporting] Error recorded:', error.message, context);
    
    // Log breadcrumbs for context
    if (this.breadcrumbs.length > 0) {
      console.log('[CrashReporting] Recent breadcrumbs:', 
        this.breadcrumbs.slice(-10).map(b => `${b.category}: ${b.message}`).join(' → ')
      );
    }

    // In production: Crashlytics.recordException({ message: error.message, stacktrace: error.stack });
  }

  /**
   * Set the user ID for crash reports
   */
  setUserId(userId: string | null): void {
    this.userId = userId;
    
    if (userId) {
      console.log('[CrashReporting] User ID set');
      // In production: Crashlytics.setUserId({ userId });
    } else {
      console.log('[CrashReporting] User ID cleared');
    }
  }

  /**
   * Add a breadcrumb for tracking user flow
   */
  addBreadcrumb(category: string, message: string): void {
    if (!this.initialized) return;

    const breadcrumb: Breadcrumb = {
      category,
      message,
      timestamp: Date.now()
    };

    this.breadcrumbs.push(breadcrumb);

    // Keep only the most recent breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.maxBreadcrumbs);
    }

    // In production: Crashlytics.log({ message: `[${category}] ${message}` });
  }

  /**
   * Set a custom key-value pair for crash reports
   */
  setCustomKey(key: string, value: string | number | boolean): void {
    if (!this.initialized) return;
    
    console.log(`[CrashReporting] Custom key: ${key} = ${value}`);
    // In production: Crashlytics.setCustomKey({ key, value: String(value), type: typeof value });
  }

  /**
   * Force a crash (for testing only)
   */
  testCrash(): void {
    console.warn('[CrashReporting] Test crash triggered');
    // In production: Crashlytics.crash({ message: 'Test crash' });
    throw new Error('Test crash from CrashReporting');
  }

  /**
   * Get current breadcrumbs (for debugging)
   */
  getBreadcrumbs(): Breadcrumb[] {
    return [...this.breadcrumbs];
  }
}

// Singleton instance
export const crashReporting = new CrashReportingService();

// Common breadcrumb categories
export const BreadcrumbCategory = {
  NAVIGATION: 'navigation',
  USER_ACTION: 'user_action',
  NETWORK: 'network',
  SHORTCUT: 'shortcut',
  SYNC: 'sync',
  AUTH: 'auth',
  ERROR: 'error',
  WIDGET: 'widget',
  APP: 'app'
} as const;
