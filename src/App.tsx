import { lazy, Suspense, useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SheetRegistryProvider } from "@/contexts/SheetRegistryContext";
import "@/i18n"; // Initialize i18n
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Always-mounted handler: listens for slideshow deep links and navigates.
// Lives at App level so it works even when Index.tsx is unmounted.
function SlideshowDeepLinkHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (event: CustomEvent<{ slideshowId: string }>) => {
      const { slideshowId } = event.detail;
      console.log('[SlideshowDeepLinkHandler] Navigating to slideshow:', slideshowId);
      // Timestamp param forces React Router to treat repeat taps as new navigations
      navigate(`/slideshow/${slideshowId}?t=${Date.now()}`, { replace: true });
    };
    window.addEventListener('onetap:open-slideshow', handler as EventListener);
    return () => window.removeEventListener('onetap:open-slideshow', handler as EventListener);
  }, [navigate]);
  return null;
}

// Lazy load heavy components to reduce initial bundle size
const VideoPlayer = lazy(() => import("./pages/VideoPlayer"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const MyShortcuts = lazy(() => import("./pages/MyShortcuts"));
const SlideshowViewer = lazy(() => import("./pages/SlideshowViewer"));

const queryClient = new QueryClient();

// Loading fallback for lazy-loaded routes
const PageLoader = () => (
  <div className="fixed inset-0 bg-background flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-muted-foreground text-sm">Loading...</p>
    </div>
  </div>
);

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SheetRegistryProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <SlideshowDeepLinkHandler />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/player" element={
                  <Suspense fallback={<PageLoader />}>
                    <VideoPlayer />
                  </Suspense>
                } />
                <Route path="/auth-callback" element={
                  <Suspense fallback={<PageLoader />}>
                    <AuthCallback />
                  </Suspense>
                } />
                <Route path="/my-shortcuts" element={
                  <Suspense fallback={<PageLoader />}>
                    <MyShortcuts />
                  </Suspense>
                } />
                <Route path="/slideshow/:shortcutId" element={
                  <Suspense fallback={<PageLoader />}>
                    <SlideshowViewer />
                  </Suspense>
                } />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </SheetRegistryProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </ThemeProvider>
);

export default App;
