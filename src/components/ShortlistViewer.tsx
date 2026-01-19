import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Globe, ExternalLink, Loader2, Smartphone, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { 
  openInAppBrowser, 
  addBrowserCloseListener,
  removeBrowserListeners,
  isNativePlatform,
  type ViewMode
} from '@/lib/embeddedWebView';
import type { SavedLink } from '@/lib/savedLinksManager';

interface ShortlistViewerProps {
  isOpen: boolean;
  onClose: () => void;
  links: SavedLink[];
  startIndex?: number;
  onOpenExternal: (url: string) => void;
}

// Extract favicon URL from a website URL
function extractFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=128`;
  } catch {
    return '';
  }
}

const VIEW_MODE_STORAGE_KEY = 'shortlist-view-mode';

export function ShortlistViewer({
  isOpen,
  onClose,
  links,
  startIndex = 0,
}: ShortlistViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return (stored === 'mobile' || stored === 'desktop') ? stored : 'desktop';
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isNative = isNativePlatform();

  // Current link
  const currentLink = links[currentIndex];
  const totalLinks = links.length;

  // Persist view mode
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const toggleViewMode = useCallback(() => {
    triggerHaptic('light');
    setViewMode((prev) => prev === 'desktop' ? 'mobile' : 'desktop');
  }, []);

  // Reset index when viewer opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(startIndex);
    }
  }, [isOpen, startIndex]);

  // Setup browser close listener for native
  useEffect(() => {
    if (isOpen && isNative) {
      addBrowserCloseListener(() => {
        // User closed the browser, stay on current link
        setIsLoading(false);
      });
      return () => {
        removeBrowserListeners();
      };
    }
  }, [isOpen, isNative]);

  const handlePrevious = useCallback(() => {
    if (totalLinks <= 1) return;
    triggerHaptic('light');
    setCurrentIndex((prev) => (prev === 0 ? totalLinks - 1 : prev - 1));
  }, [totalLinks]);

  const handleNext = useCallback(() => {
    if (totalLinks <= 1) return;
    triggerHaptic('light');
    setCurrentIndex((prev) => (prev === totalLinks - 1 ? 0 : prev + 1));
  }, [totalLinks]);

  const handleClose = useCallback(() => {
    triggerHaptic('light');
    onClose();
  }, [onClose]);

  const handleOpenLink = useCallback(async () => {
    if (!currentLink) return;
    triggerHaptic('medium');
    setIsLoading(true);
    
    if (isNative) {
      await openInAppBrowser(currentLink.url, viewMode, currentLink.title);
      // Loading will be cleared by callback or timeout
    } else {
      // Web: Open in iframe or new tab
      window.open(currentLink.url, '_blank', 'noopener,noreferrer');
      setIsLoading(false);
    }
  }, [currentLink, isNative, viewMode]);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrevious, handleNext, handleClose]);

  if (!isOpen || !currentLink) return null;

  const faviconUrl = extractFaviconUrl(currentLink.url);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
          aria-label="Close viewer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Title - truncated */}
        <div className="flex-1 mx-4 text-center">
          <p className="font-medium text-sm truncate">{currentLink.title}</p>
          <p className="text-xs text-muted-foreground">
            {currentIndex + 1} of {totalLinks}
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-0.5 bg-muted rounded-full p-0.5">
          <button
            onClick={toggleViewMode}
            className={cn(
              "p-1.5 rounded-full transition-colors",
              viewMode === 'mobile' 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="Mobile view"
          >
            <Smartphone className="h-4 w-4" />
          </button>
          <button
            onClick={toggleViewMode}
            className={cn(
              "p-1.5 rounded-full transition-colors",
              viewMode === 'desktop' 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="Desktop view"
          >
            <Monitor className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 flex flex-col">
        {isNative ? (
          // Native: Show link preview card with "View Desktop Site" button
          <div className="flex-1 flex items-center justify-center p-6 bg-muted/30">
            <div className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full text-center shadow-lg">
              {/* Favicon */}
              <div className="flex justify-center mb-6">
                <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center overflow-hidden">
                  {faviconUrl ? (
                    <img
                      src={faviconUrl}
                      alt=""
                      className="h-12 w-12 object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <Globe className={cn("h-10 w-10 text-muted-foreground", faviconUrl && "hidden")} />
                </div>
              </div>

              {/* Title */}
              <h3 className="font-semibold text-lg mb-2 line-clamp-2">{currentLink.title}</h3>
              
              {/* URL */}
              <p className="text-sm text-muted-foreground truncate mb-6">
                {currentLink.url}
              </p>

              {/* Open Button */}
              <button
                onClick={handleOpenLink}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-5 w-5" />
                    View {viewMode === 'desktop' ? 'Desktop' : 'Mobile'} Site
                  </>
                )}
              </button>
              
              <p className="text-xs text-muted-foreground mt-4">
                {viewMode === 'desktop' 
                  ? 'Opens in-app browser with desktop layout' 
                  : 'Opens in-app browser with mobile layout'}
              </p>
            </div>
          </div>
        ) : (
          // Web: Try to embed in iframe with desktop User-Agent hint
          <div className="flex-1 relative">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading...</p>
                </div>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={currentLink.url}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              title={currentLink.title}
              onLoad={handleIframeLoad}
            />
          </div>
        )}
      </div>

      {/* Navigation Footer - Only if multiple links */}
      {totalLinks > 1 && (
        <footer className="flex items-center justify-between px-4 py-3 border-t border-border bg-card safe-bottom">
          <button
            onClick={handlePrevious}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
              "bg-muted hover:bg-muted/80"
            )}
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm font-medium">Previous</span>
          </button>

          <button
            onClick={handleNext}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
              "bg-muted hover:bg-muted/80"
            )}
          >
            <span className="text-sm font-medium">Next</span>
            <ChevronRight className="h-5 w-5" />
          </button>
        </footer>
      )}
    </div>
  );
}
