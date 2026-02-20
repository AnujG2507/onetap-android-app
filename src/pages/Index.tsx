import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useNavigate, useLocation } from 'react-router-dom';
import { BottomNav, TabType } from '@/components/BottomNav';
import { BookmarkLibrary } from '@/components/BookmarkLibrary';
import { AccessFlow, AccessStep, ContentSourceType } from '@/components/AccessFlow';
import { ProfilePage } from '@/components/ProfilePage';
import { NotificationsPage } from '@/components/NotificationsPage';
import { SharedUrlActionSheet } from '@/components/SharedUrlActionSheet';
import { SharedFileActionSheet } from '@/components/SharedFileActionSheet';
import { OnboardingFlow } from '@/components/OnboardingFlow';
// LANGUAGE SUPPORT TEMPORARILY DISABLED
// This import is preserved for future re-enablement. Component is not rendered.
// Do not delete. Will be re-enabled in a future update.
import { LanguageSelectionStep } from '@/components/LanguageSelectionStep';
import { MessageChooserSheet } from '@/components/MessageChooserSheet';
import { ShortcutEditSheet } from '@/components/ShortcutEditSheet';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useBackButton } from '@/hooks/useBackButton';
import { useAuth } from '@/hooks/useAuth';
import { useAutoSync } from '@/hooks/useAutoSync';
import { useDeepLink } from '@/hooks/useDeepLink';
import { useOAuthRecovery } from '@/hooks/useOAuthRecovery';
import { usePendingWhatsAppAction } from '@/hooks/usePendingWhatsAppAction';
import { usePendingShortcutEdit } from '@/hooks/usePendingShortcutEdit';
import { useShortcuts } from '@/hooks/useShortcuts';
import { createHomeScreenShortcut } from '@/lib/shortcutManager';
import { useReviewPrompt } from '@/hooks/useReviewPrompt';
import { OAuthRecoveryBanner } from '@/components/auth/OAuthRecoveryBanner';
import { ReviewPromptBanner } from '@/components/ReviewPromptBanner';
import { useSharedContent } from '@/hooks/useSharedContent';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { useToast } from '@/hooks/use-toast';
import { useSheetRegistry } from '@/contexts/SheetRegistryContext';
import { getShortlistedLinks, clearAllShortlist, addSavedLink } from '@/lib/savedLinksManager';
import { getActiveCount, onScheduledActionsChange } from '@/lib/scheduledActionsManager';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import type { ScheduledActionDestination } from '@/types/scheduledAction';
import type { ShortcutData } from '@/types/shortcut';
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
  const { t } = useTranslation();
  useAppUpdate();
  const [activeTab, setActiveTab] = useState<TabType>('access');
  const [accessStep, setAccessStep] = useState<AccessStep>('source');
  const [contentSourceType, setContentSourceType] = useState<ContentSourceType>(null);
  const [isBookmarkSelectionMode, setIsBookmarkSelectionMode] = useState(false);
  const [isNotificationsSelectionMode, setIsNotificationsSelectionMode] = useState(false);
  const [isRemindersCreatorOpen, setIsRemindersCreatorOpen] = useState(false);
  const [isRemindersEditorOpen, setIsRemindersEditorOpen] = useState(false);
  const [isBookmarkActionSheetOpen, setIsBookmarkActionSheetOpen] = useState(false);
  const [bookmarkClearSignal, setBookmarkClearSignal] = useState(0);
  const [notificationsClearSignal, setNotificationsClearSignal] = useState(0);
  const [shortcutUrlFromBookmark, setShortcutUrlFromBookmark] = useState<string | null>(null);
  const [shortcutTitleFromShare, setShortcutTitleFromShare] = useState<string | undefined>(undefined);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [pendingSharedUrl, setPendingSharedUrl] = useState<string | null>(null);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [activeActionsCount, setActiveActionsCount] = useState(() => getActiveCount());
  const [pendingReminderDestination, setPendingReminderDestination] = useState<ScheduledActionDestination | null>(null);
  const [pendingSharedFile, setPendingSharedFile] = useState<import('@/types/shortcut').ContentSource | null>(null);
  const [pendingSharedMultiFiles, setPendingSharedMultiFiles] = useState<import('@/types/shortcut').MultiFileSource | null>(null);
  const lastSharedIdRef = useRef<string | null>(null);
  const previousTabRef = useRef<TabType>('access');

  // Onboarding state
  const { isComplete: onboardingComplete, hasSelectedLanguage, markLanguageSelected, currentStep, nextStep, skipOnboarding, completeOnboarding } = useOnboarding();

  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { closeTopSheet } = useSheetRegistry();
  
  // Enable auto-sync when user is signed in
  useAutoSync();
  
  // Handle native OAuth deep links
  useDeepLink();
  
  // Handle OAuth recovery after app kill during sign-in
  const { state: oauthRecoveryState, retry: retryOAuth, dismiss: dismissOAuthRecovery } = useOAuthRecovery();
  
  // Handle pending WhatsApp actions from multi-message shortcuts
  const {
    pendingAction: pendingWhatsAppAction,
    handleMessageSelected: handleWhatsAppMessageSelected,
    handleOpenChatOnly: handleWhatsAppOpenChatOnly,
    clearPendingAction: clearWhatsAppPendingAction,
  } = usePendingWhatsAppAction();
  
  // Handle pending shortcut edit from home screen long-press
  const { pendingEditId, clearPendingEdit } = usePendingShortcutEdit();
  const { shortcuts, updateShortcut, getShortcut, deleteShortcut } = useShortcuts();
  const { shouldShow: showReviewPrompt, dismiss: dismissReview, openReview } = useReviewPrompt(shortcuts.length);
  const [editingShortcut, setEditingShortcut] = useState<ShortcutData | null>(null);
  
  // Handle shared content from Android Share Sheet (always active regardless of tab)
  const { sharedContent, sharedMultiFiles, sharedAction, isLoading: isLoadingShared, clearSharedContent } = useSharedContent();
  
  // State for passing shared files/slideshow into AccessFlow
  const [initialFileSource, setInitialFileSource] = useState<import('@/types/shortcut').ContentSource | null>(null);
  const [initialSlideshowSource, setInitialSlideshowSource] = useState<import('@/types/shortcut').MultiFileSource | null>(null);
  
  // Check if shortlist has items
  const hasShortlist = getShortlistedLinks().length > 0;

  // Subscribe to scheduled actions changes for badge
  useEffect(() => {
    const updateCount = () => setActiveActionsCount(getActiveCount());
    const unsubscribe = onScheduledActionsChange(updateCount);
    return unsubscribe;
  }, []);

  // Handle manage-shortcuts deep link (from static app shortcut)
  useEffect(() => {
    const handleManageShortcuts = () => {
      console.log('[Index] Opening shortcuts list via deep link');
      navigate('/my-shortcuts');
    };
    
    window.addEventListener('onetap:manage-shortcuts', handleManageShortcuts);
    return () => window.removeEventListener('onetap:manage-shortcuts', handleManageShortcuts);
  }, [navigate]);

  // Slideshow deep link listener moved to App.tsx (SlideshowDeepLinkHandler)
  // so it stays active even when Index is unmounted

  // Handle incoming navigation state (e.g., from MyShortcuts page creating a reminder)
  useEffect(() => {
    const state = location.state as { pendingReminder?: ScheduledActionDestination; activeTab?: TabType } | null;
    if (state?.pendingReminder) {
      setPendingReminderDestination(state.pendingReminder);
      if (state.activeTab) {
        setActiveTab(state.activeTab);
      }
      // Clear the state
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  // Handle pending shortcut edit from home screen long-press
  useEffect(() => {
    if (pendingEditId) {
      const shortcut = getShortcut(pendingEditId);
      if (shortcut) {
        console.log('[Index] Opening edit sheet for shortcut:', pendingEditId);
        setEditingShortcut(shortcut);
      } else {
        console.warn('[Index] Pending edit shortcut not found:', pendingEditId);
      }
      clearPendingEdit();
    }
  }, [pendingEditId, getShortcut, clearPendingEdit]);

  // Handler for saving shortcut edits
  const handleSaveShortcutEdit = useCallback(async (id: string, updates: Parameters<typeof updateShortcut>[1]) => {
    return await updateShortcut(id, updates);
  }, [updateShortcut]);

  // Handler for re-adding shortcut to home screen
  const handleReAddToHomeScreen = useCallback(async (shortcut: ShortcutData) => {
    const success = await createHomeScreenShortcut(shortcut, {
      fileData: shortcut.thumbnailData,
      thumbnailData: shortcut.thumbnailData,
    });
    if (success) {
      toast({ title: t('shortcutAction.addedToHomeScreen', 'Added to home screen') });
    }
  }, [toast, t]);

  // Handler for deleting shortcut from action sheet
  const handleDeleteShortcut = useCallback((id: string) => {
    deleteShortcut(id);
    toast({
      title: t('shortcutAction.deleted', 'Access deleted'),
    });
  }, [deleteShortcut, toast, t]);

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

      // For files, show action sheet before routing
      if (sharedContent.type === 'file') {
        console.log('[Index] File shared, showing file action sheet');
        setPendingSharedFile(sharedContent);
        clearSharedContent();
        return;
      }

      // Clear the shared content for any unhandled types
      clearSharedContent();
    }
  }, [sharedContent, sharedAction, isLoadingShared, clearSharedContent, navigate, activeTab]);

  // Handle multi-file shares (slideshow) - show action sheet first
  useEffect(() => {
    if (sharedMultiFiles) {
      console.log('[Index] Multi-file share detected, showing file action sheet:', sharedMultiFiles.files.length);
      // Create a display-only ContentSource for the action sheet
      const displaySource: import('@/types/shortcut').ContentSource = {
        type: 'file',
        uri: sharedMultiFiles.files[0]?.uri || '',
        mimeType: 'image/*',
        name: `${sharedMultiFiles.files.length} images`,
      };
      setPendingSharedFile(displaySource);
      setPendingSharedMultiFiles(sharedMultiFiles);
      clearSharedContent();
    }
  }, [sharedMultiFiles, clearSharedContent]);

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
        title: t('toasts.linkSaved'),
      });
    } else if (result.status === 'duplicate') {
      toast({
        title: t('library.alreadySaved'),
        description: t('library.alreadySavedDesc'),
      });
    }
    
    setPendingSharedUrl(null);
  }, [pendingSharedUrl, toast]);

  // Handle shared URL action: Create Shortcut
  const handleCreateSharedShortcut = useCallback((title?: string) => {
    if (!pendingSharedUrl) return;
    
    // Switch to access tab and set URL for shortcut creation
    setShortcutUrlFromBookmark(pendingSharedUrl);
    setShortcutTitleFromShare(title);
    setActiveTab('access');
    setPendingSharedUrl(null);
  }, [pendingSharedUrl]);

  // Handle shared URL action: Create Reminder
  const handleCreateSharedReminder = useCallback(() => {
    if (!pendingSharedUrl) return;
    
    // Switch to reminders tab and set destination for reminder creation
    try {
      const hostname = new URL(pendingSharedUrl).hostname.replace('www.', '');
      setPendingReminderDestination({ type: 'url', uri: pendingSharedUrl, name: hostname });
    } catch {
      setPendingReminderDestination({ type: 'url', uri: pendingSharedUrl, name: pendingSharedUrl });
    }
    setActiveTab('reminders');
    setPendingSharedUrl(null);
  }, [pendingSharedUrl]);

  // Handle dismissing the shared URL action sheet
  const handleDismissSharedUrl = useCallback(() => {
    setPendingSharedUrl(null);
  }, []);

  // Handle shared file action: Create Shortcut (One Tap Access)
  const handleCreateSharedFileShortcut = useCallback(() => {
    if (!pendingSharedFile) return;
    if (pendingSharedMultiFiles) {
      // Multi-file → slideshow
      setInitialSlideshowSource(pendingSharedMultiFiles);
    } else {
      // Single file
      setInitialFileSource(pendingSharedFile);
    }
    if (activeTab !== 'access') {
      setActiveTab('access');
    }
    setPendingSharedFile(null);
    setPendingSharedMultiFiles(null);
  }, [pendingSharedFile, pendingSharedMultiFiles, activeTab]);

  // Handle shared file action: Create Reminder
  const handleCreateSharedFileReminder = useCallback(() => {
    if (!pendingSharedFile) return;
    setPendingReminderDestination({
      type: 'file',
      uri: pendingSharedFile.uri,
      name: pendingSharedFile.name || 'File',
      mimeType: pendingSharedFile.mimeType,
    });
    setActiveTab('reminders');
    setPendingSharedFile(null);
    setPendingSharedMultiFiles(null);
  }, [pendingSharedFile]);

  // Handle dismissing the shared file action sheet
  const handleDismissSharedFile = useCallback(() => {
    setPendingSharedFile(null);
    setPendingSharedMultiFiles(null);
  }, []);

  // Handle clearing bookmark selection
  const handleClearBookmarkSelection = useCallback(() => {
    clearAllShortlist();
    setBookmarkClearSignal(s => s + 1);
    setIsBookmarkSelectionMode(false);
  }, []);

  // Handle clearing notifications selection
  const handleClearNotificationsSelection = useCallback(() => {
    setNotificationsClearSignal(s => s + 1);
    setIsNotificationsSelectionMode(false);
  }, []);

  // Handle exit confirmation
  const handleExitApp = useCallback(() => {
    App.exitApp();
  }, []);

  // Handle Android back button
  // All home screens: access tab (at source step), notifications tab (not selecting), bookmarks tab (not selecting), profile tab
  const isOnHomeScreen = (accessStep === 'source' && activeTab === 'access') ||
    (activeTab === 'reminders' && !isNotificationsSelectionMode) ||
    (activeTab === 'bookmarks' && !isBookmarkSelectionMode) ||
    activeTab === 'profile';

  useBackButton({
    isHomeScreen: false, // We handle exit ourselves with confirmation
    onBack: () => {
      console.log('[Index] Back button triggered, step:', accessStep, 'tab:', activeTab);

      // Priority 1: Close any open sheet/dialog first
      if (closeTopSheet()) {
        console.log('[Index] Closed a registered sheet');
        return;
      }

      // Priority 2: If on home screen, show exit confirmation
      if (isOnHomeScreen) {
        setShowExitConfirmation(true);
        return;
      }
      
      // Priority 3: If in notifications selection mode, clear selection
      if (activeTab === 'reminders' && isNotificationsSelectionMode) {
        handleClearNotificationsSelection();
        return;
      }
      
      // Priority 4: If in bookmark selection mode, clear selection
      if (activeTab === 'bookmarks' && isBookmarkSelectionMode) {
        handleClearBookmarkSelection();
        return;
      }

      // Priority 5: Handle access flow back navigation
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

  // Handler for creating reminder from bookmark library
  const handleCreateReminderFromBookmark = useCallback((url: string) => {
    console.log('[Index] Creating reminder from bookmark:', url);
    setPendingReminderDestination({ type: 'url', uri: url, name: url });
    setActiveTab('reminders');
  }, []);

  // Clear the URL once AccessFlow has consumed it
  const handleInitialUrlConsumed = useCallback(() => {
    setShortcutUrlFromBookmark(null);
    setShortcutTitleFromShare(undefined);
  }, []);

  // Track step and content type changes from AccessFlow
  const handleAccessStepChange = useCallback((step: AccessStep) => {
    setAccessStep(step);
  }, []);

  const handleContentSourceTypeChange = useCallback((type: ContentSourceType) => {
    setContentSourceType(type);
  }, []);

  // Show bottom nav only on main screens (not during sub-flows)
  const showBottomNav = accessStep === 'source' || activeTab === 'reminders' || activeTab === 'bookmarks' || activeTab === 'profile';

  // Tab order for swipe navigation
  const tabOrder: TabType[] = useMemo(() => ['access', 'reminders', 'bookmarks', 'profile'], []);
  
  // Swipe is only enabled on home screens (source step for access, or bookmarks/profile tabs without selection mode or open forms/sheets/pickers)
  const swipeEnabled = showBottomNav && !isBookmarkSelectionMode && !isNotificationsSelectionMode && !isRemindersCreatorOpen && !isRemindersEditorOpen && !isBookmarkActionSheetOpen;
  
  // Track tab changes to determine slide direction
  const handleTabChange = useCallback((newTab: TabType) => {
    const currentIndex = tabOrder.indexOf(activeTab);
    const newIndex = tabOrder.indexOf(newTab);
    
    if (newIndex > currentIndex) {
      setSlideDirection('left'); // Moving forward (content slides in from right)
    } else if (newIndex < currentIndex) {
      setSlideDirection('right'); // Moving backward (content slides in from left)
    }
    
    previousTabRef.current = activeTab;
    setActiveTab(newTab);
  }, [activeTab, tabOrder]);
  
  const handleSwipeLeft = useCallback(() => {
    const currentIndex = tabOrder.indexOf(activeTab);
    if (currentIndex < tabOrder.length - 1) {
      handleTabChange(tabOrder[currentIndex + 1]);
    }
  }, [activeTab, tabOrder, handleTabChange]);
  
  const handleSwipeRight = useCallback(() => {
    const currentIndex = tabOrder.indexOf(activeTab);
    if (currentIndex > 0) {
      handleTabChange(tabOrder[currentIndex - 1]);
    }
  }, [activeTab, tabOrder, handleTabChange]);
  
  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    enabled: swipeEnabled,
    threshold: 60,
  });

  // Get animation class based on slide direction
  const getSlideAnimation = () => {
    if (slideDirection === 'left') return 'animate-slide-in-from-right';
    if (slideDirection === 'right') return 'animate-slide-in-from-left';
    return 'animate-fade-in';
  };

  // LANGUAGE SUPPORT TEMPORARILY DISABLED
  // This condition will never be true during English-only launch (hasSelectedLanguage is always true).
  // Do not delete. Will be re-enabled in a future update.
  if (!hasSelectedLanguage) {
    return <LanguageSelectionStep onContinue={markLanguageSelected} />;
  }

  // Show onboarding for first-time users
  if (!onboardingComplete) {
    return (
      <OnboardingFlow
        currentStep={currentStep}
        onNext={nextStep}
        onSkip={skipOnboarding}
        onComplete={completeOnboarding}
      />
    );
  }

  return (
    <div className="h-app-viewport bg-background flex flex-col overflow-hidden">
      {/* OAuth Recovery Banner - calm UI for interrupted sign-in */}
      {(oauthRecoveryState === 'checking' || oauthRecoveryState === 'recovering' || oauthRecoveryState === 'failed') && (
        <OAuthRecoveryBanner
          state={oauthRecoveryState}
          onRetry={retryOAuth}
          onDismiss={dismissOAuthRecovery}
        />
      )}
      {/* Access Tab Content */}
      {activeTab === 'access' && (
        <div 
          key={`access-${slideDirection}`}
          className={`flex-1 min-h-0 flex flex-col ${getSlideAnimation()}`}
          {...(accessStep === 'source' ? swipeHandlers : {})}
        >
          <AccessFlow
            onStepChange={handleAccessStepChange}
            onContentSourceTypeChange={handleContentSourceTypeChange}
            initialUrlForShortcut={shortcutUrlFromBookmark}
            initialTitleForShortcut={shortcutTitleFromShare}
            onInitialUrlConsumed={handleInitialUrlConsumed}
            initialFileSource={initialFileSource}
            onInitialFileConsumed={() => setInitialFileSource(null)}
            initialSlideshowSource={initialSlideshowSource}
            onInitialSlideshowConsumed={() => setInitialSlideshowSource(null)}
            onGoToBookmarks={() => handleTabChange('bookmarks')}
            onGoToNotifications={() => handleTabChange('reminders')}
            onCreateReminder={(destination) => {
              setPendingReminderDestination(destination);
              handleTabChange('reminders');
            }}
          />
        </div>
      )}

      {/* Reminders Tab Content */}
      {activeTab === 'reminders' && (
        <div 
          key={`reminders-${slideDirection}`}
          className={`flex-1 min-h-0 flex flex-col ${getSlideAnimation()}`}
          {...swipeHandlers}
        >
          <NotificationsPage
            onSelectionModeChange={setIsNotificationsSelectionMode}
            clearSelectionSignal={notificationsClearSignal}
            initialDestination={pendingReminderDestination}
            onInitialDestinationConsumed={() => setPendingReminderDestination(null)}
            onCreatorOpenChange={setIsRemindersCreatorOpen}
            onEditorOpenChange={setIsRemindersEditorOpen}
          />
        </div>
      )}

      {/* Bookmarks Tab Content */}
      {activeTab === 'bookmarks' && (
        <div 
          key={`bookmarks-${slideDirection}`}
          className={`flex-1 min-h-0 flex flex-col ${getSlideAnimation()}`}
          {...swipeHandlers}
        >
          <BookmarkLibrary
            onCreateShortcut={handleCreateShortcutFromBookmark}
            onCreateReminder={handleCreateReminderFromBookmark}
            onSelectionModeChange={setIsBookmarkSelectionMode}
            clearSelectionSignal={bookmarkClearSignal}
            onActionSheetOpenChange={setIsBookmarkActionSheetOpen}
          />
        </div>
      )}

      {/* Profile Tab Content */}
      {activeTab === 'profile' && (
        <div 
          key={`profile-${slideDirection}`}
          className={`flex-1 min-h-0 flex flex-col ${getSlideAnimation()}`}
          {...swipeHandlers}
        >
          <ProfilePage />
        </div>
      )}

      {/* Review Prompt Banner */}
      {showBottomNav && (
        <ReviewPromptBanner
          visible={showReviewPrompt}
          onDismiss={dismissReview}
          onRate={openReview}
        />
      )}

      {/* Bottom Navigation */}
      {showBottomNav && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          hasShortlist={hasShortlist}
          isSignedIn={!!user}
          hasActiveActions={activeActionsCount > 0}
        />
      )}

      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitConfirmation} onOpenChange={setShowExitConfirmation}>
        <AlertDialogContent className="max-w-[280px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('app.exitTitle')}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="flex-1 m-0">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="flex-1 m-0" onClick={handleExitApp}>
              {t('app.exit')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Shared URL Action Picker (always available, regardless of active tab) */}
      {pendingSharedUrl && (
        <SharedUrlActionSheet
          url={pendingSharedUrl}
          onSaveToLibrary={handleSaveSharedToLibrary}
          onCreateShortcut={handleCreateSharedShortcut}
          onCreateReminder={handleCreateSharedReminder}
          onDismiss={handleDismissSharedUrl}
        />
      )}

      {/* Shared File Action Picker (always available, regardless of active tab) */}
      {pendingSharedFile && (
        <SharedFileActionSheet
          file={pendingSharedFile}
          onCreateShortcut={handleCreateSharedFileShortcut}
          onCreateReminder={handleCreateSharedFileReminder}
          onDismiss={handleDismissSharedFile}
          hideReminder={false}
          displayName={pendingSharedMultiFiles ? `${pendingSharedMultiFiles.files.length} images` : undefined}
          displaySubtitle={pendingSharedMultiFiles ? 'Slideshow' : undefined}
        />
      )}

      {/* WhatsApp Message Chooser (for multi-message shortcuts) */}
      <MessageChooserSheet
        open={!!pendingWhatsAppAction}
        onOpenChange={(open) => {
          if (!open) clearWhatsAppPendingAction();
        }}
        messages={pendingWhatsAppAction?.messages || []}
        contactName={pendingWhatsAppAction?.contactName}
        onSelectMessage={handleWhatsAppMessageSelected}
        onOpenChatOnly={handleWhatsAppOpenChatOnly}
      />

      {/* Shortcut Edit Sheet (for editing shortcuts) */}
      <ShortcutEditSheet
        shortcut={editingShortcut}
        isOpen={!!editingShortcut}
        onClose={() => setEditingShortcut(null)}
        onSave={handleSaveShortcutEdit}
        onReAddToHomeScreen={handleReAddToHomeScreen}
      />

    </div>
  );
};

export default Index;
