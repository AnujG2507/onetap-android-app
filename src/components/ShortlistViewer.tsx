import { useState, useEffect, useCallback } from 'react';
import { X, ExternalLink, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import type { SavedLink } from '@/lib/savedLinksManager';

interface ShortlistViewerProps {
  isOpen: boolean;
  onClose: () => void;
  links: SavedLink[];
  startIndex?: number;
  onOpenExternal: (url: string) => void;
}

export function ShortlistViewer({
  isOpen,
  onClose,
  links,
  startIndex = 0,
  onOpenExternal,
}: ShortlistViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Reset index when viewer opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(startIndex);
      setIsLoading(true);
      setLoadError(false);
    }
  }, [isOpen, startIndex]);

  // Current link
  const currentLink = links[currentIndex];
  const totalLinks = links.length;

  const handlePrevious = useCallback(() => {
    if (totalLinks <= 1) return;
    triggerHaptic('light');
    setIsLoading(true);
    setLoadError(false);
    setCurrentIndex((prev) => (prev === 0 ? totalLinks - 1 : prev - 1));
  }, [totalLinks]);

  const handleNext = useCallback(() => {
    if (totalLinks <= 1) return;
    triggerHaptic('light');
    setIsLoading(true);
    setLoadError(false);
    setCurrentIndex((prev) => (prev === totalLinks - 1 ? 0 : prev + 1));
  }, [totalLinks]);

  const handleClose = () => {
    triggerHaptic('light');
    onClose();
  };

  const handleOpenExternal = () => {
    if (!currentLink) return;
    triggerHaptic('medium');
    onOpenExternal(currentLink.url);
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setLoadError(true);
  };

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
  }, [isOpen, handlePrevious, handleNext]);

  if (!isOpen || !currentLink) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header - Minimal controls */}
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

        {/* Open external button */}
        <button
          onClick={handleOpenExternal}
          className="p-2 -mr-2 rounded-full hover:bg-muted transition-colors"
          aria-label="Open in browser"
        >
          <ExternalLink className="h-5 w-5" />
        </button>
      </header>

      {/* WebView Container */}
      <div className="flex-1 relative overflow-hidden">
        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="flex flex-col items-center gap-4 p-6 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <X className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Unable to load this page</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This site may not allow embedding
                </p>
              </div>
              <button
                onClick={handleOpenExternal}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground"
              >
                <ExternalLink className="h-4 w-4" />
                Open in browser
              </button>
            </div>
          </div>
        )}

        {/* iframe - NO address bar, NO tabs, NO history */}
        <iframe
          key={currentLink.url}
          src={currentLink.url}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          title={currentLink.title}
        />
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
