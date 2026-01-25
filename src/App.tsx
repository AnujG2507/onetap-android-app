import { lazy, Suspense } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SheetRegistryProvider } from "@/contexts/SheetRegistryContext";
import { TranslationLoader } from "@/components/TranslationLoader";
import "@/i18n"; // Initialize i18n
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Lazy load heavy components to reduce initial bundle size
const VideoPlayer = lazy(() => import("./pages/VideoPlayer"));
const PDFViewer = lazy(() => import("./pages/PDFViewer"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));

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
      <Suspense fallback={<TranslationLoader />}>
        <QueryClientProvider client={queryClient}>
          <SheetRegistryProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/player" element={
                    <Suspense fallback={<PageLoader />}>
                      <VideoPlayer />
                    </Suspense>
                  } />
                  <Route path="/pdf" element={
                    <Suspense fallback={<PageLoader />}>
                      <PDFViewer />
                    </Suspense>
                  } />
                  <Route path="/auth-callback" element={
                    <Suspense fallback={<PageLoader />}>
                      <AuthCallback />
                    </Suspense>
                  } />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </SheetRegistryProvider>
        </QueryClientProvider>
      </Suspense>
    </ErrorBoundary>
  </ThemeProvider>
);

export default App;
