import { useState, useCallback, useEffect, useRef } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import { BottomNav, TabType } from '@/components/BottomNav';
import { BookmarkLibrary } from '@/components/BookmarkLibrary';
import { AccessFlow, AccessStep, ContentSourceType } from '@/components/AccessFlow';
import { ProfilePage } from '@/components/ProfilePage';
import { AuthDebugPanel } from '@/components/AuthDebugPanel';
import { SharedUrlActionSheet } from '@/components/SharedUrlActionSheet';
import { useBackButton } from '@/hooks/useBackButton';
import { useAuth } from '@/hooks/useAuth';
import { useAutoSync } from '@/hooks/useAutoSync';
import { useDeepLink } from '@/hooks/useDeepLink';
import { useSharedContent } from '@/hooks/useSharedContent';
import { useToast } from '@/hooks/use-toast';
import { getShortlistedLinks, clearAllShortlist, addSavedLink } from '@/lib/savedLinksManager';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
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
  const [pendingSharedUrl, setPendingSharedUrl] = useState<string | null>(null);
  const lastSharedIdRef = useRef<string | null>(null);

  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Enable auto-sync when user is signed in
  useAutoSync();
  
  // Handle native OAuth deep links
  useDeepLink();
  
  // Handle shared content from Android Share Sheet (always active regardless of tab)
  const { sharedContent, sharedAction, isLoading: isLoadingShared, clearSharedContent } = useSharedContent();
  
  // Check if shortlist has items
  const hasShortlist = getShortlistedLinks().length > 0;

  // Handle shared content from Android Share Sheet
  useEffect(() => {
    if (!isLoadingShared && sharedContent) {
      const isVideoFile =
        sharedContent.type === 'file' && !!sharedContent.mimeType && sharedContent.mimeType.startsWith('video/');

      const shouldAutoPlayVideo = sharedAction === 'app.onetap.PLAY_VIDEO' || (sharedAction == null && isVideoFile);

      if (shouldAutoPlayVideo && sharedContent.type === 'file') {
        if (Capacitor.isNativePlatform()) {
          const mimeType = sharedContent.mimeType || 'video/*';
          console.log('[Index] Video open detected, opening native player:', {
            action: sharedAction,
            uri: sharedContent.uri,
            type: mimeType,
          });

          (async () => {
            try {
              await ShortcutPlugin.openNativeVideoPlayer({ uri: sharedContent.uri, mimeType });
            } catch (e) {
              console.error('[Index] Failed to open native player, falling back to web player:', e);
              const uri = encodeURIComponent(sharedContent.uri);
              const type = encodeURIComponent(mimeType);
              const nonce = Date.now();
              navigate(`/player?uri=${uri}&type=${type}&t=${nonce}`);
              return;
            } finally {
              clearSharedContent();
            }
          })();

          return;
        }

        const uri = encodeURIComponent(sharedContent.uri);
        const type = encodeURIComponent(sharedContent.mimeType || 'video/*');
        const nonce = Date.now();
        console.log('[Index] Video open detected, navigating to player:', { action: sharedAction, uri: sharedContent.uri, type: sharedContent.mimeType, nonce });

        navigate(`/player?uri=${uri}&type=${type}&t=${nonce}`);
        clearSharedContent();
        return;
      }

      const shareId = `${sharedContent.uri}-${sharedContent.type}`;

      if (lastSharedIdRef.current === shareId) {
        console.log('[Index] Already processed this share, skipping');
        return;
      }

      console.log('[Index] Processing shared content:', sharedContent);
      lastSharedIdRef.current = shareId;

      // For URLs shared via share sheet, show action picker
      if (sharedContent.type === 'share' || sharedContent.type === 'url') {
        console.log('[Index] URL shared, showing action picker');
        setPendingSharedUrl(sharedContent.uri);
        clearSharedContent();
        return;
      }

      // For files, switch to Access tab and let AccessFlow handle it via initialUrlForShortcut
      // (File handling is done in AccessFlow since it needs the customize step)
      if (activeTab !== 'access') {
        setActiveTab('access');
      }
      // Clear the shared content - AccessFlow will pick up any file content on its own
      clearSharedContent();
    }
  }, [sharedContent, sharedAction, isLoadingShared, clearSharedContent, navigate, activeTab]);

  // Handle shared URL action: Save to Library
  const handleSaveSharedToLibrary = useCallback((data?: { title?: string; description?: string; tag?: string | null }) => {
    if (!pendingSharedUrl) return;
    
    const result = addSavedLink(
      pendingSharedUrl,
      data?.title,
      data?.description,
      data?.tag
    );
    
    if (result.status === 'added') {
      toast({
        title: 'Saved to Library',
        description: 'Link has been added to your bookmarks.',
      });
    } else if (result.status === 'duplicate') {
      toast({
        title: 'Already saved',
        description: 'This link is already in your library.',
      });
    }
    
    setPendingSharedUrl(null);
  }, [pendingSharedUrl, toast]);

  // Handle shared URL action: Create Shortcut
  const handleCreateSharedShortcut = useCallback(() => {
    if (!pendingSharedUrl) return;
    
    // Switch to access tab and set URL for shortcut creation
    setShortcutUrlFromBookmark(pendingSharedUrl);
    setActiveTab('access');
    setPendingSharedUrl(null);
  }, [pendingSharedUrl]);

  // Handle dismissing the shared URL action sheet
  const handleDismissSharedUrl = useCallback(() => {
    setPendingSharedUrl(null);
  }, []);

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
            onGoToBookmarks={() => setActiveTab('bookmarks')}
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

      {/* Shared URL Action Picker (always available, regardless of active tab) */}
      {pendingSharedUrl && (
        <SharedUrlActionSheet
          url={pendingSharedUrl}
          onSaveToLibrary={handleSaveSharedToLibrary}
          onCreateShortcut={handleCreateSharedShortcut}
          onDismiss={handleDismissSharedUrl}
        />
      )}
    </div>
  );
};

export default Index;
