import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getLastPage, saveLastPage } from '@/lib/pdfResumeManager';
import { useBackButton } from '@/hooks/useBackButton';
import * as pdfjs from 'pdfjs-dist';

// Reading threshold before showing exit confirmation (30 seconds)
const READING_THRESHOLD_MS = 30000;

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

export default function PDFViewer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const uri = searchParams.get('uri') || '';
  const shortcutId = searchParams.get('shortcutId') || '';
  const resumeEnabled = searchParams.get('resume') === 'true';
  
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [startTime] = useState(() => Date.now());
  const [showControls, setShowControls] = useState(true);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  
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
        
        const loadingTask = pdfjs.getDocument(pdfSource);
        const pdf = await loadingTask.promise;
        
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        
        // Restore last page if resume enabled
        if (resumeEnabled && shortcutId) {
          const savedPage = getLastPage(shortcutId);
          if (savedPage && savedPage >= 1 && savedPage <= pdf.numPages) {
            setCurrentPage(savedPage);
            console.log('[PDFViewer] Resuming at page:', savedPage);
          }
        }
        
        setLoading(false);
      } catch (err) {
        console.error('[PDFViewer] Failed to load PDF:', err);
        setError('Failed to load PDF. The file may be corrupted or inaccessible.');
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
  
  // Save page position when it changes
  useEffect(() => {
    if (resumeEnabled && shortcutId && currentPage > 0) {
      saveLastPage(shortcutId, currentPage);
    }
  }, [currentPage, resumeEnabled, shortcutId]);
  
  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }
    
    hideControlsTimer.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);
  
  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, [resetControlsTimer]);
  
  // Navigation
  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
      resetControlsTimer();
    }
  };
  
  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
      resetControlsTimer();
    }
  };
  
  // Zoom controls
  const zoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3));
    resetControlsTimer();
  };
  
  const zoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.5));
    resetControlsTimer();
  };
  
  const resetZoom = () => {
    setZoom(1);
    resetControlsTimer();
  };
  
  // Touch handlers for pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setTouchState({ initialDistance: distance, initialZoom: zoom });
    }
    resetControlsTimer();
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
  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap
      setZoom(prev => prev === 1 ? 2 : 1);
    }
    lastTapRef.current = now;
    resetControlsTimer();
  };
  
  // Confirm exit and navigate home
  const confirmExit = useCallback(() => {
    if (resumeEnabled && shortcutId && currentPage > 0) {
      saveLastPage(shortcutId, currentPage);
    }
    navigate('/');
  }, [resumeEnabled, shortcutId, currentPage, navigate]);
  
  // Close handler that checks reading duration before closing
  const handleClose = useCallback(() => {
    const readingDuration = Date.now() - startTime;
    
    // Show confirmation if reading for more than threshold
    if (readingDuration > READING_THRESHOLD_MS) {
      setShowExitDialog(true);
      return;
    }
    
    // Otherwise close immediately
    confirmExit();
  }, [startTime, confirmExit]);
  
  // Handle Android back button
  useBackButton({
    isHomeScreen: false,
    onBack: handleClose,
  });
  
  const handleBack = () => {
    handleClose();
  };
  
  if (loading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 animate-fade-in">
          {/* Document icon with pulse effect */}
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl animate-pulse" />
            <div className="relative bg-muted/50 rounded-2xl p-6">
              <FileText className="h-16 w-16 text-primary" />
            </div>
          </div>
          
          {/* Loading indicator */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-muted-foreground font-medium">Loading document...</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">📄</div>
          <h2 className="text-xl font-semibold mb-2">Unable to Load PDF</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={handleBack}>Go Back</Button>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      className="fixed inset-0 bg-background flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleTap}
    >
      {/* Header */}
      <header 
        className={`absolute top-0 left-0 right-0 z-20 bg-background/90 backdrop-blur-sm border-b transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between p-3 safe-top">
          <button
            onClick={(e) => { e.stopPropagation(); handleBack(); }}
            className="p-2 -ml-2 rounded-full hover:bg-muted active:bg-muted/80"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          
          <span className="text-sm font-medium">
            Page {currentPage} of {totalPages}
          </span>
          
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); zoomOut(); }}
              className="p-2 rounded-full hover:bg-muted active:bg-muted/80"
              disabled={zoom <= 0.5}
            >
              <ZoomOut className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); resetZoom(); }}
              className="p-2 rounded-full hover:bg-muted active:bg-muted/80"
            >
              <RotateCw className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); zoomIn(); }}
              className="p-2 rounded-full hover:bg-muted active:bg-muted/80"
              disabled={zoom >= 3}
            >
              <ZoomIn className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>
      
      {/* PDF Canvas */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto pt-14 pb-16"
      >
        <canvas
          ref={canvasRef}
          className="mx-auto"
          style={{ touchAction: 'pan-x pan-y' }}
        />
      </div>
      
      {/* Navigation Footer */}
      <footer 
        className={`absolute bottom-0 left-0 right-0 z-20 bg-background/90 backdrop-blur-sm border-t transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-center gap-8 p-3 safe-bottom">
          <button
            onClick={(e) => { e.stopPropagation(); goToPrevPage(); }}
            disabled={currentPage <= 1}
            className="p-3 rounded-full bg-muted hover:bg-muted/80 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          
          <span className="text-lg font-medium min-w-[80px] text-center">
            {currentPage} / {totalPages}
          </span>
          
          <button
            onClick={(e) => { e.stopPropagation(); goToNextPage(); }}
            disabled={currentPage >= totalPages}
            className="p-3 rounded-full bg-muted hover:bg-muted/80 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
      </footer>
      
      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave PDF?</AlertDialogTitle>
            <AlertDialogDescription>
              You've been reading for a while. Your current page ({currentPage}) will be saved 
              so you can continue where you left off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Reading</AlertDialogCancel>
            <AlertDialogAction onClick={confirmExit}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
