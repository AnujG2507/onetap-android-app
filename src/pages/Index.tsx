import { useState, useCallback } from 'react';
import { App } from '@capacitor/app';
import { BottomNav, TabType } from '@/components/BottomNav';
import { BookmarkLibrary } from '@/components/BookmarkLibrary';
import { AccessFlow, AccessStep, ContentSourceType } from '@/components/AccessFlow';
import { ProfilePage } from '@/components/ProfilePage';
import { AuthDebugPanel } from '@/components/AuthDebugPanel';
import { useBackButton } from '@/hooks/useBackButton';
import { useAuth } from '@/hooks/useAuth';
import { useAutoSync } from '@/hooks/useAutoSync';
import { useDeepLink } from '@/hooks/useDeepLink';
import { getShortlistedLinks, clearAllShortlist } from '@/lib/savedLinksManager';
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

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabType>('access');
  const [accessStep, setAccessStep] = useState<AccessStep>('source');
  const [contentSourceType, setContentSourceType] = useState<ContentSourceType>(null);
  const [isBookmarkSelectionMode, setIsBookmarkSelectionMode] = useState(false);
  const [bookmarkClearSignal, setBookmarkClearSignal] = useState(0);
  const [shortcutUrlFromBookmark, setShortcutUrlFromBookmark] = useState<string | null>(null);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);

  const { user } = useAuth();
  
  // Enable auto-sync when user is signed in
  useAutoSync();
  
  // Handle native OAuth deep links
  useDeepLink();
  
  // Check if shortlist has items
  const hasShortlist = getShortlistedLinks().length > 0;

  // Handle clearing bookmark selection
  const handleClearBookmarkSelection = useCallback(() => {
    clearAllShortlist();
    setBookmarkClearSignal(s => s + 1);
    setIsBookmarkSelectionMode(false);
  }, []);

  // Handle exit confirmation
  const handleExitApp = useCallback(() => {
    App.exitApp();
  }, []);

  // Handle Android back button
  // Both access tab (at source step), bookmarks tab (when not selecting), and profile tab are "home" screens
  const isOnHomeScreen = (accessStep === 'source' && activeTab === 'access') ||
    (activeTab === 'bookmarks' && !isBookmarkSelectionMode) ||
    activeTab === 'profile';

  useBackButton({
    isHomeScreen: false, // We handle exit ourselves with confirmation
    onBack: () => {
      console.log('[Index] Back button triggered, step:', accessStep, 'tab:', activeTab);

      // If on home screen, show exit confirmation
      if (isOnHomeScreen) {
        setShowExitConfirmation(true);
        return;
      }
      // If in bookmark selection mode, clear selection instead of navigating
      if (activeTab === 'bookmarks' && isBookmarkSelectionMode) {
        handleClearBookmarkSelection();
        return;
      }

      // Handle access flow back navigation
      if (activeTab === 'access') {
        if (accessStep === 'url') {
          setAccessStep('source');
        } else if (accessStep === 'customize') {
          if (contentSourceType === 'url') {
            setAccessStep('url');
          } else {
            setAccessStep('source');
          }
        } else if (accessStep === 'contact') {
          setAccessStep('source');
        } else if (accessStep === 'success') {
          setAccessStep('source');
        }
      }
    }
  });

  // Handler for creating shortcut from bookmark library
  const handleCreateShortcutFromBookmark = useCallback((url: string) => {
    console.log('[Index] Creating shortcut from bookmark:', url);
    setShortcutUrlFromBookmark(url);
    setActiveTab('access');
  }, []);

  // Clear the URL once AccessFlow has consumed it
  const handleInitialUrlConsumed = useCallback(() => {
    setShortcutUrlFromBookmark(null);
  }, []);

  // Track step and content type changes from AccessFlow
  const handleAccessStepChange = useCallback((step: AccessStep) => {
    setAccessStep(step);
  }, []);

  const handleContentSourceTypeChange = useCallback((type: ContentSourceType) => {
    setContentSourceType(type);
  }, []);

  // Show bottom nav only on main screens (not during sub-flows)
  const showBottomNav = accessStep === 'source' || activeTab === 'profile';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Access Tab Content */}
      {activeTab === 'access' && (
        <div className="flex-1 flex flex-col animate-fade-in">
          <AccessFlow
            onStepChange={handleAccessStepChange}
            onContentSourceTypeChange={handleContentSourceTypeChange}
            initialUrlForShortcut={shortcutUrlFromBookmark}
            onInitialUrlConsumed={handleInitialUrlConsumed}
          />
        </div>
      )}

      {/* Bookmarks Tab Content */}
      {activeTab === 'bookmarks' && (
        <div className="flex-1 flex flex-col animate-fade-in">
          <BookmarkLibrary
            onCreateShortcut={handleCreateShortcutFromBookmark}
            onSelectionModeChange={setIsBookmarkSelectionMode}
            clearSelectionSignal={bookmarkClearSignal}
          />
        </div>
      )}

      {/* Profile Tab Content */}
      {activeTab === 'profile' && (
        <div className="flex-1 flex flex-col animate-fade-in">
          <ProfilePage />
        </div>
      )}

      {/* Bottom Navigation */}
      {showBottomNav && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          hasShortlist={hasShortlist}
          isSignedIn={!!user}
        />
      )}

      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitConfirmation} onOpenChange={setShowExitConfirmation}>
        <AlertDialogContent className="max-w-[280px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Exit app?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to exit the app?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="flex-1 m-0">Cancel</AlertDialogCancel>
            <AlertDialogAction className="flex-1 m-0" onClick={handleExitApp}>
              Exit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dev-only auth debug panel */}
      <AuthDebugPanel />
    </div>
  );
};

export default Index;
