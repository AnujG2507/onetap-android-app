import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { 
  Search, 
  Sun, 
  Moon, 
  BookOpen,
  ChevronLeft, 
  ChevronRight,
  ChevronUp,
  ChevronDown,
  X,
  FileText,
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
  
  // UI state
  const [showControls, setShowControls] = useState(false);
  const [readingMode, setReadingMode] = useState<ReadingMode>('system');
  
  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ page: number; index: number }[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  
  // Page jump state
  const [showPageJump, setShowPageJump] = useState(false);
  const [pageJumpValue, setPageJumpValue] = useState('');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pageJumpInputRef = useRef<HTMLInputElement>(null);
  
  // Touch gesture state
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
        
        // Restore state if resume enabled
        if (resumeEnabled && shortcutId) {
          const savedPage = getLastPage(shortcutId);
          if (savedPage && savedPage >= 1 && savedPage <= pdf.numPages) {
            setCurrentPage(savedPage);
            console.log('[PDFViewer] Resuming at page:', savedPage);
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
  
  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    
    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d')!;
        
        // Calculate scale to fit container width
        const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
        const viewport = page.getViewport({ scale: 1 });
        const baseScale = containerWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale: baseScale * zoom });
        
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        
        await page.render({
          canvasContext: context,
          viewport: scaledViewport,
        }).promise;
        
        console.log('[PDFViewer] Rendered page:', currentPage);
      } catch (err) {
        console.error('[PDFViewer] Failed to render page:', err);
      }
    };
    
    renderPage();
  }, [pdfDoc, currentPage, zoom]);
  
  // Save state when it changes (only after PDF is loaded)
  useEffect(() => {
    if (!pdfDoc || loading || !resumeEnabled || !shortcutId) return;
    
    if (currentPage > 0) {
      saveLastPage(shortcutId, currentPage);
    }
  }, [currentPage, resumeEnabled, shortcutId, pdfDoc, loading]);
  
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
  
  // Navigation
  const goToPrevPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  }, [currentPage]);
  
  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  }, [currentPage, totalPages]);
  
  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);
  
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
  
  // Search handling
  const handleSearch = useCallback(async () => {
    if (!pdfDoc || !searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchResults([]);
    setCurrentSearchIndex(0);
    
    const results: { page: number; index: number }[] = [];
    const query = searchQuery.toLowerCase();
    
    try {
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const text = textContent.items
          .map((item: any) => item.str)
          .join(' ')
          .toLowerCase();
        
        let index = 0;
        let position = text.indexOf(query);
        while (position !== -1) {
          results.push({ page: pageNum, index });
          index++;
          position = text.indexOf(query, position + 1);
        }
      }
      
      setSearchResults(results);
      if (results.length > 0) {
        setCurrentPage(results[0].page);
      }
    } catch (err) {
      console.error('[PDFViewer] Search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, [pdfDoc, searchQuery]);
  
  const goToPrevResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex = currentSearchIndex > 0 ? currentSearchIndex - 1 : searchResults.length - 1;
    setCurrentSearchIndex(newIndex);
    setCurrentPage(searchResults[newIndex].page);
  }, [searchResults, currentSearchIndex]);
  
  const goToNextResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(newIndex);
    setCurrentPage(searchResults[newIndex].page);
  }, [searchResults, currentSearchIndex]);
  
  // Page jump handling
  const handlePageJump = useCallback(() => {
    const page = parseInt(pageJumpValue, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setShowPageJump(false);
      setPageJumpValue('');
    }
  }, [pageJumpValue, totalPages]);
  
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
      style={{ backgroundColor: readingMode === 'system' ? undefined : undefined }}
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
      
      {/* PDF Canvas Container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto"
      >
        <canvas
          ref={canvasRef}
          className="mx-auto"
          style={{ touchAction: 'pan-x pan-y' }}
        />
      </div>
      
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
            {/* Left: Navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={goToPrevPage}
                disabled={currentPage <= 1}
                className="p-2.5 rounded-full hover:bg-muted active:scale-95 transition-all disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={goToNextPage}
                disabled={currentPage >= totalPages}
                className="p-2.5 rounded-full hover:bg-muted active:scale-95 transition-all disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
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
