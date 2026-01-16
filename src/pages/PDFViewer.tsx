import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { 
  Search, 
  Sun, 
  Moon, 
  BookOpen,
  ChevronUp,
  ChevronDown,
  X,
  FileText,
  ZoomIn,
  ZoomOut,
  MapPin,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  getLastPage, 
  saveLastPage,
  getLastZoom,
  saveZoom,
  getReadingMode,
  saveReadingMode,
  ReadingMode,
} from '@/lib/pdfResumeManager';
import { useBackButton } from '@/hooks/useBackButton';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import * as pdfjs from 'pdfjs-dist';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface PageRenderState {
  rendered: boolean;
  height: number;
}

interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SearchMatch {
  page: number;
  index: number;
  rects: HighlightRect[];
}

export default function PDFViewer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const uri = searchParams.get('uri') || '';
  const shortcutId = searchParams.get('shortcutId') || '';
  const resumeEnabled = searchParams.get('resume') === 'true';
  
  // Core state
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Page render tracking
  const [pageStates, setPageStates] = useState<PageRenderState[]>([]);
  
  // UI state
  const [showControls, setShowControls] = useState(false);
  const [readingMode, setReadingMode] = useState<ReadingMode>('system');
  
  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  
  // Track page dimensions for highlight positioning
  const [pageDimensions, setPageDimensions] = useState<Map<number, { width: number; height: number; scale: number }>>(new Map());
  
  // Page jump state
  const [showPageJump, setShowPageJump] = useState(false);
  const [pageJumpValue, setPageJumpValue] = useState('');
  
  // Match flash animation state
  const [matchFlash, setMatchFlash] = useState(false);
  
  // Mini-map visibility
  const [showMiniMap, setShowMiniMap] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pageJumpInputRef = useRef<HTMLInputElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const saveScrollDebounce = useRef<NodeJS.Timeout | null>(null);
  const initialScrollDone = useRef(false);
  
  // Touch gesture state for pinch zoom
  const [touchState, setTouchState] = useState<{
    initialDistance: number;
    initialZoom: number;
  } | null>(null);
  
  // Load PDF document
  useEffect(() => {
    if (!uri) {
      setError('No PDF URI provided');
      setLoading(false);
      return;
    }
    
    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('[PDFViewer] Raw URI from params:', uri);
        
        // Convert native URIs to WebView-accessible URLs on native platforms
        let pdfSource = uri;
        if (Capacitor.isNativePlatform()) {
          if (uri.startsWith('file://') || uri.startsWith('content://')) {
            pdfSource = Capacitor.convertFileSrc(uri);
            console.log('[PDFViewer] Converted URI for native WebView:', pdfSource);
          }
        }
        
        console.log('[PDFViewer] Loading PDF from:', pdfSource);
        
        // Clear the shared intent on native to prevent reopening on back navigation
        if (Capacitor.isNativePlatform()) {
          ShortcutPlugin.clearSharedIntent().catch(() => {});
          console.log('[PDFViewer] Cleared shared intent');
        }
        
        const loadingTask = pdfjs.getDocument(pdfSource);
        const pdf = await loadingTask.promise;
        
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        
        // Initialize page states with estimated heights
        const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
        const defaultHeight = containerWidth * 1.4; // Approximate A4 ratio
        setPageStates(Array(pdf.numPages).fill({ rendered: false, height: defaultHeight }));
        
        // Restore state if resume enabled
        if (resumeEnabled && shortcutId) {
          const savedPage = getLastPage(shortcutId);
          if (savedPage && savedPage >= 1 && savedPage <= pdf.numPages) {
            setCurrentPage(savedPage);
            console.log('[PDFViewer] Will resume at page:', savedPage);
          }
          
          const savedZoom = getLastZoom(shortcutId);
          if (savedZoom) {
            setZoom(savedZoom);
          }
          
          const savedMode = getReadingMode(shortcutId);
          setReadingMode(savedMode);
        }
        
        setLoading(false);
      } catch (err) {
        console.error('[PDFViewer] Failed to load PDF:', err);
        setError('The file may have been moved or is no longer accessible.');
        setLoading(false);
      }
    };
    
    loadPdf();
  }, [uri, resumeEnabled, shortcutId]);
  
  // Render a single page with high DPI support
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc) return;
    
    const canvas = canvasRefs.current.get(pageNum);
    if (!canvas) return;
    
    try {
      const page = await pdfDoc.getPage(pageNum);
      const context = canvas.getContext('2d')!;
      
      // Get device pixel ratio for crystal-clear rendering
      const dpr = window.devicePixelRatio || 1;
      
      // Calculate scale to fit container width
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
      const viewport = page.getViewport({ scale: 1 });
      const baseScale = containerWidth / viewport.width;
      const displayScale = baseScale * zoom;
      const renderScale = displayScale * dpr; // Render at high resolution
      
      const scaledViewport = page.getViewport({ scale: renderScale });
      
      // Set canvas to high-res dimensions
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      
      // Scale down via CSS for display (maintains sharpness)
      const displayWidth = scaledViewport.width / dpr;
      const displayHeight = scaledViewport.height / dpr;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      
      // Store page dimensions for highlight positioning
      setPageDimensions(prev => {
        const updated = new Map(prev);
        updated.set(pageNum, {
          width: displayWidth,
          height: displayHeight,
          scale: displayScale
        });
        return updated;
      });
      
      await page.render({
        canvasContext: context,
        viewport: scaledViewport,
      }).promise;
      
      // Update page state with actual height
      setPageStates(prev => {
        const updated = [...prev];
        updated[pageNum - 1] = { 
          rendered: true, 
          height: displayHeight 
        };
        return updated;
      });
      
      console.log('[PDFViewer] Rendered page:', pageNum, 'at', dpr + 'x DPR');
    } catch (err) {
      console.error('[PDFViewer] Failed to render page:', pageNum, err);
    }
  }, [pdfDoc, zoom]);
  
  // Set up intersection observer for lazy loading
  useEffect(() => {
    if (!pdfDoc || loading) return;
    
    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    
    const visiblePages = new Set<number>();
    
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const pageNum = parseInt(entry.target.getAttribute('data-page') || '0', 10);
          if (pageNum === 0) return;
          
          if (entry.isIntersecting) {
            visiblePages.add(pageNum);
            // Render this page and adjacent pages
            [pageNum - 1, pageNum, pageNum + 1].forEach(p => {
              if (p >= 1 && p <= totalPages && !pageStates[p - 1]?.rendered) {
                renderPage(p);
              }
            });
          } else {
            visiblePages.delete(pageNum);
          }
        });
        
        // Update current page based on most visible page
        if (visiblePages.size > 0) {
          const minVisible = Math.min(...visiblePages);
          setCurrentPage(minVisible);
        }
      },
      {
        root: containerRef.current,
        rootMargin: '100px 0px', // Preload pages slightly before they're visible
        threshold: 0.1,
      }
    );
    
    // Observe all page containers
    pageRefs.current.forEach((ref) => {
      if (ref) {
        observerRef.current?.observe(ref);
      }
    });
    
    return () => {
      observerRef.current?.disconnect();
    };
  }, [pdfDoc, loading, totalPages, pageStates, renderPage]);
  
  // Re-render all visible pages when zoom changes
  useEffect(() => {
    if (!pdfDoc || loading) return;
    
    // Reset rendered state to force re-render
    setPageStates(prev => prev.map(state => ({ ...state, rendered: false })));
    canvasRefs.current.clear();
    
    // Clear search results to force recalculation with new zoom level
    if (searchResults.length > 0) {
      setSearchResults([]);
    }
  }, [zoom, pdfDoc, loading]);
  
  // Scroll to saved page on initial load
  useEffect(() => {
    if (!pdfDoc || loading || initialScrollDone.current) return;
    
    const savedPage = resumeEnabled && shortcutId ? getLastPage(shortcutId) : null;
    const targetPage = savedPage || 1;
    
    // Small delay to ensure pages are in DOM
    setTimeout(() => {
      const pageElement = pageRefs.current.get(targetPage);
      if (pageElement && containerRef.current) {
        pageElement.scrollIntoView({ behavior: 'instant', block: 'start' });
        initialScrollDone.current = true;
        console.log('[PDFViewer] Scrolled to page:', targetPage);
      }
    }, 100);
  }, [pdfDoc, loading, resumeEnabled, shortcutId]);
  
  // Save current page on scroll (debounced)
  useEffect(() => {
    if (!resumeEnabled || !shortcutId || !pdfDoc) return;
    
    if (saveScrollDebounce.current) {
      clearTimeout(saveScrollDebounce.current);
    }
    
    saveScrollDebounce.current = setTimeout(() => {
      if (currentPage > 0) {
        saveLastPage(shortcutId, currentPage);
      }
    }, 500);
    
    return () => {
      if (saveScrollDebounce.current) {
        clearTimeout(saveScrollDebounce.current);
      }
    };
  }, [currentPage, resumeEnabled, shortcutId, pdfDoc]);
  
  // Save zoom level
  useEffect(() => {
    if (!pdfDoc || loading || !resumeEnabled || !shortcutId) return;
    saveZoom(shortcutId, zoom);
  }, [zoom, resumeEnabled, shortcutId, pdfDoc, loading]);
  
  // Hide controls after inactivity
  const resetControlsTimer = useCallback(() => {
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }
    
    hideControlsTimer.current = setTimeout(() => {
      if (!showSearch && !showPageJump) {
        setShowControls(false);
      }
    }, 3000);
  }, [showSearch, showPageJump]);
  
  useEffect(() => {
    if (showControls) {
      resetControlsTimer();
    }
    return () => {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, [showControls, resetControlsTimer]);
  
  // Scroll to specific page
  const scrollToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      const pageElement = pageRefs.current.get(page);
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [totalPages]);
  
  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  }, []);
  
  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.25, 0.5));
  }, []);
  
  // Touch handlers for pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setTouchState({ initialDistance: distance, initialZoom: zoom });
    }
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchState) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = distance / touchState.initialDistance;
      const newZoom = Math.min(Math.max(touchState.initialZoom * scale, 0.5), 3);
      setZoom(newZoom);
    }
  };
  
  const handleTouchEnd = () => {
    setTouchState(null);
  };
  
  // Double tap to toggle zoom
  const lastTapRef = useRef<number>(0);
  const handleTap = (e: React.MouseEvent | React.TouchEvent) => {
    // Don't toggle controls if interacting with UI elements
    if ((e.target as HTMLElement).closest('button, input, [role="dialog"]')) {
      return;
    }
    
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap - toggle zoom
      setZoom(prev => prev === 1 ? 2 : 1);
    } else {
      // Single tap - toggle controls
      setShowControls(prev => !prev);
    }
    lastTapRef.current = now;
  };
  
  // Reading mode handling
  const cycleReadingMode = useCallback(() => {
    const modes: ReadingMode[] = ['system', 'light', 'dark', 'sepia'];
    const currentIndex = modes.indexOf(readingMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setReadingMode(nextMode);
    if (shortcutId) {
      saveReadingMode(shortcutId, nextMode);
    }
  }, [readingMode, shortcutId]);
  
  const getReadingModeClass = () => {
    switch (readingMode) {
      case 'light': return 'pdf-reading-light';
      case 'dark': return 'pdf-reading-dark';
      case 'sepia': return 'pdf-reading-sepia';
      default: return '';
    }
  };
  
  const getReadingModeIcon = () => {
    switch (readingMode) {
      case 'light': return <Sun className="h-5 w-5" />;
      case 'dark': return <Moon className="h-5 w-5" />;
      case 'sepia': return <BookOpen className="h-5 w-5" />;
      default: return <Sun className="h-5 w-5 opacity-50" />;
    }
  };
  
  // Search handling with position extraction for highlights
  const handleSearch = useCallback(async () => {
    if (!pdfDoc || !searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchResults([]);
    setCurrentSearchIndex(0);
    
    const results: SearchMatch[] = [];
    const query = searchQuery.toLowerCase();
    
    try {
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        const pageHeight = viewport.height;
        
        // Get current scale for this page
        const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
        const baseScale = containerWidth / viewport.width;
        const displayScale = baseScale * zoom;
        
        // Build a map of text items with their positions
        const items = textContent.items as any[];
        let globalIndex = 0;
        
        for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
          const item = items[itemIdx];
          if (!item.str) continue;
          
          const itemText = item.str.toLowerCase();
          const queryLower = query.toLowerCase();
          
          // Find all occurrences of query in this text item
          let searchPos = 0;
          let matchPos = itemText.indexOf(queryLower, searchPos);
          
          while (matchPos !== -1) {
            // Get the transform matrix [scaleX, skewY, skewX, scaleY, translateX, translateY]
            const transform = item.transform;
            const x = transform[4];
            const y = transform[5];
            const itemWidth = item.width || 0;
            const itemHeight = item.height || (transform[3] || 12); // Fallback height
            
            // Calculate approximate position of the match within the item
            const charWidth = itemWidth / Math.max(item.str.length, 1);
            const matchX = x + (matchPos * charWidth);
            const matchWidth = Math.min(queryLower.length * charWidth, itemWidth - (matchPos * charWidth));
            
            // Convert PDF coordinates to canvas coordinates
            // PDF origin is bottom-left, canvas origin is top-left
            const rect: HighlightRect = {
              x: matchX * displayScale,
              y: (pageHeight - y - itemHeight) * displayScale,
              width: matchWidth * displayScale,
              height: itemHeight * displayScale * 1.2, // Slight padding
            };
            
            results.push({
              page: pageNum,
              index: globalIndex,
              rects: [rect],
            });
            
            globalIndex++;
            searchPos = matchPos + 1;
            matchPos = itemText.indexOf(queryLower, searchPos);
          }
        }
      }
      
      setSearchResults(results);
      if (results.length > 0) {
        scrollToPage(results[0].page);
      }
      console.log('[PDFViewer] Found', results.length, 'search matches');
    } catch (err) {
      console.error('[PDFViewer] Search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, [pdfDoc, searchQuery, scrollToPage, zoom]);
  
  const goToPrevResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex = currentSearchIndex > 0 ? currentSearchIndex - 1 : searchResults.length - 1;
    setCurrentSearchIndex(newIndex);
    
    // Trigger flash animation
    setMatchFlash(true);
    setTimeout(() => setMatchFlash(false), 600);
    
    // Smooth scroll to center the match
    const match = searchResults[newIndex];
    const pageElement = pageRefs.current.get(match.page);
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [searchResults, currentSearchIndex]);
  
  const goToNextResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(newIndex);
    
    // Trigger flash animation
    setMatchFlash(true);
    setTimeout(() => setMatchFlash(false), 600);
    
    // Smooth scroll to center the match
    const match = searchResults[newIndex];
    const pageElement = pageRefs.current.get(match.page);
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [searchResults, currentSearchIndex]);
  
  // Page jump handling
  const handlePageJump = useCallback(() => {
    const page = parseInt(pageJumpValue, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      scrollToPage(page);
      setShowPageJump(false);
      setPageJumpValue('');
    }
  }, [pageJumpValue, totalPages, scrollToPage]);
  
  // Close and navigate home
  const handleClose = useCallback(() => {
    if (resumeEnabled && shortcutId && currentPage > 0) {
      saveLastPage(shortcutId, currentPage);
      saveZoom(shortcutId, zoom);
    }
    navigate('/', { replace: true });
  }, [resumeEnabled, shortcutId, currentPage, zoom, navigate]);
  
  // Handle Android back button
  useBackButton({
    isHomeScreen: false,
    onBack: handleClose,
  });
  
  // Focus search input when opened
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);
  
  // Focus page jump input when opened
  useEffect(() => {
    if (showPageJump && pageJumpInputRef.current) {
      pageJumpInputRef.current.focus();
    }
  }, [showPageJump]);
  
  // Show/hide mini-map based on search results
  useEffect(() => {
    setShowMiniMap(searchResults.length > 0);
  }, [searchResults]);
  
  // Compute pages with matches for mini-map
  const pagesWithMatches = useMemo(() => {
    const pageMatchCounts = new Map<number, number>();
    searchResults.forEach(result => {
      pageMatchCounts.set(result.page, (pageMatchCounts.get(result.page) || 0) + 1);
    });
    return pageMatchCounts;
  }, [searchResults]);
  
  // Get container width for placeholder sizing
  const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
  const placeholderHeight = containerWidth * 1.4;
  
  // Loading state - instant placeholder
  if (loading) {
    return (
      <div className="fixed inset-0 bg-muted flex items-center justify-center">
        <div className="w-full max-w-md aspect-[3/4] bg-background rounded-lg shadow-lg mx-4" />
      </div>
    );
  }
  
  // Error state - calm and clear
  if (error) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
          <h2 className="text-xl font-medium mb-2">Unable to open document</h2>
          <p className="text-muted-foreground mb-8">{error}</p>
          <Button variant="outline" onClick={handleClose} className="min-w-32">
            ← Go Back
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      className={`fixed inset-0 flex flex-col ${getReadingModeClass()}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleTap}
    >
      {/* Search Bar - slides in from top */}
      {showSearch && (
        <div 
          className="absolute top-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-b p-3 animate-fade-in"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Search in document..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pr-10"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <Button size="icon" variant="ghost" onClick={handleSearch}>
              <Search className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {searchResults.length > 0 && (
            <div className="flex items-center justify-between mt-2 text-sm">
              <span className="text-muted-foreground">
                {currentSearchIndex + 1} of {searchResults.length} matches
              </span>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={goToPrevResult}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={goToNextResult}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          
          {searchQuery && searchResults.length === 0 && !isSearching && (
            <p className="text-sm text-muted-foreground mt-2">No matches found</p>
          )}
        </div>
      )}
      
      {/* Page Jump Dialog */}
      {showPageJump && (
        <div 
          className="absolute inset-0 z-40 bg-background/80 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setShowPageJump(false)}
        >
          <div 
            className="bg-card border rounded-xl p-6 w-full max-w-xs shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium mb-4 text-center">Go to page</h3>
            <Input
              ref={pageJumpInputRef}
              type="number"
              min={1}
              max={totalPages}
              placeholder={`1 - ${totalPages}`}
              value={pageJumpValue}
              onChange={(e) => setPageJumpValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePageJump()}
              className="text-center text-lg mb-4"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowPageJump(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handlePageJump}>
                Go
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* PDF Pages Container - Vertical Scrolling */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ touchAction: 'pan-y pinch-zoom' }}
      >
        <div className="flex flex-col items-center pb-24">
          {Array.from({ length: totalPages }, (_, i) => {
            const pageNum = i + 1;
            const pageState = pageStates[i];
            const dims = pageDimensions.get(pageNum);
            
            // Get highlights for this page
            const pageHighlights = searchResults.filter(r => r.page === pageNum);
            const currentMatchOnPage = searchResults[currentSearchIndex];
            
            return (
              <div
                key={pageNum}
                ref={(el) => {
                  if (el) {
                    pageRefs.current.set(pageNum, el);
                    observerRef.current?.observe(el);
                  }
                }}
                data-page={pageNum}
                className="relative w-full flex justify-center mb-2"
                style={{ minHeight: pageState?.height || placeholderHeight }}
              >
                {/* Canvas container with highlight overlay */}
                <div className="relative">
                  <canvas
                    ref={(el) => {
                      if (el) {
                        canvasRefs.current.set(pageNum, el);
                      }
                    }}
                    className="shadow-lg"
                  />
                  
                  {/* Search highlight overlay */}
                  {pageHighlights.length > 0 && dims && (
                    <div 
                      className="absolute inset-0 pointer-events-none"
                      style={{ width: dims.width, height: dims.height }}
                    >
                      {pageHighlights.map((match, matchIdx) => 
                        match.rects.map((rect, rectIdx) => {
                          const isCurrentMatch = 
                            currentMatchOnPage?.page === pageNum && 
                            currentMatchOnPage?.index === match.index;
                          
                          return (
                            <div
                              key={`${matchIdx}-${rectIdx}`}
                              className={`absolute rounded-sm transition-all ${
                                isCurrentMatch 
                                  ? `bg-orange-400/60 ring-2 ring-orange-500 ${matchFlash ? 'animate-match-flash' : ''}` 
                                  : 'bg-yellow-300/50'
                              }`}
                              style={{
                                left: rect.x,
                                top: rect.y,
                                width: Math.max(rect.width, 20),
                                height: rect.height,
                              }}
                            />
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                
                {/* Page number overlay */}
                <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm text-xs px-2 py-1 rounded text-muted-foreground">
                  {pageNum}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Search Mini-Map */}
      {showMiniMap && searchResults.length > 0 && (
        <div 
          className="absolute right-2 top-1/2 -translate-y-1/2 z-25 flex flex-col items-center"
          onClick={e => e.stopPropagation()}
        >
          <div className="bg-background/90 backdrop-blur-sm rounded-full border shadow-lg p-1.5 max-h-[50vh] overflow-y-auto scrollbar-none">
            <div className="flex flex-col gap-0.5">
              {totalPages <= 40 ? (
                // Show all pages as markers for smaller documents
                Array.from({ length: totalPages }, (_, i) => {
                  const pageNum = i + 1;
                  const matchCount = pagesWithMatches.get(pageNum) || 0;
                  const hasCurrentMatch = searchResults[currentSearchIndex]?.page === pageNum;
                  const hasMatches = matchCount > 0;
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => scrollToPage(pageNum)}
                      className={`
                        w-3 h-3 rounded-full transition-all flex-shrink-0
                        ${hasCurrentMatch 
                          ? 'bg-orange-500 ring-2 ring-orange-300 scale-125' 
                          : hasMatches 
                            ? 'bg-yellow-400 hover:bg-yellow-500' 
                            : 'bg-muted hover:bg-muted-foreground/30'
                        }
                      `}
                      title={`Page ${pageNum}${hasMatches ? ` (${matchCount} match${matchCount > 1 ? 'es' : ''})` : ''}`}
                    />
                  );
                })
              ) : (
                // For large documents, show only pages with matches
                [...pagesWithMatches.entries()]
                  .sort(([a], [b]) => a - b)
                  .map(([pageNum, matchCount]) => {
                    const hasCurrentMatch = searchResults[currentSearchIndex]?.page === pageNum;
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => scrollToPage(pageNum)}
                        className={`
                          w-3 h-3 rounded-full transition-all flex-shrink-0
                          ${hasCurrentMatch 
                            ? 'bg-orange-500 ring-2 ring-orange-300 scale-125' 
                            : 'bg-yellow-400 hover:bg-yellow-500'
                          }
                        `}
                        title={`Page ${pageNum} (${matchCount} match${matchCount > 1 ? 'es' : ''})`}
                      />
                    );
                  })
              )}
            </div>
          </div>
          
          {/* Match count badge */}
          <div className="bg-primary text-primary-foreground text-xs font-medium rounded-full px-2 py-1 mt-2 shadow-md">
            {searchResults.length}
          </div>
          
          {/* Current page indicator */}
          <div className="text-xs text-muted-foreground mt-1 bg-background/80 rounded px-1.5 py-0.5">
            p.{searchResults[currentSearchIndex]?.page || 1}
          </div>
        </div>
      )}
      
      {/* Minimal Floating Controls */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Page indicator - centered, tappable for page jump */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-24 mb-safe">
          <button
            onClick={() => setShowPageJump(true)}
            className="bg-background/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg border text-sm font-medium"
          >
            {currentPage} / {totalPages}
          </button>
        </div>
        
        {/* Control bar */}
        <div className="bg-background/90 backdrop-blur-sm border-t safe-bottom">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Left: Zoom controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
                className="p-2.5 rounded-full hover:bg-muted active:scale-95 transition-all disabled:opacity-30"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <span className="text-sm font-medium min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 3}
                className="p-2.5 rounded-full hover:bg-muted active:scale-95 transition-all disabled:opacity-30"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
            </div>
            
            {/* Right: Tools */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSearch(true)}
                className="p-2.5 rounded-full hover:bg-muted active:scale-95 transition-all"
              >
                <Search className="h-5 w-5" />
              </button>
              
              <button
                onClick={cycleReadingMode}
                className={`p-2.5 rounded-full hover:bg-muted active:scale-95 transition-all ${
                  readingMode !== 'system' ? 'text-primary' : ''
                }`}
              >
                {getReadingModeIcon()}
              </button>
              
              <button
                onClick={handleClose}
                className="p-2.5 rounded-full hover:bg-muted active:scale-95 transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
