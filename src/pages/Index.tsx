import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import { BottomNav, TabType } from '@/components/BottomNav';
import { BookmarkLibrary } from '@/components/BookmarkLibrary';
import { AccessFlow, AccessStep, ContentSourceType } from '@/components/AccessFlow';
import { ProfilePage } from '@/components/ProfilePage';
import { NotificationsPage } from '@/components/NotificationsPage';
import { SharedUrlActionSheet } from '@/components/SharedUrlActionSheet';
import { OnboardingFlow } from '@/components/OnboardingFlow';
import { LanguageSelectionStep } from '@/components/LanguageSelectionStep';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useBackButton } from '@/hooks/useBackButton';
import { useAuth } from '@/hooks/useAuth';
import { useAutoSync } from '@/hooks/useAutoSync';
import { useDeepLink } from '@/hooks/useDeepLink';
import { useSharedContent } from '@/hooks/useSharedContent';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { useToast } from '@/hooks/use-toast';
import { useSheetRegistry } from '@/contexts/SheetRegistryContext';
import { getShortlistedLinks, clearAllShortlist, addSavedLink } from '@/lib/savedLinksManager';
import { getActiveCount, onScheduledActionsChange } from '@/lib/scheduledActionsManager';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import type { ScheduledActionDestination } from '@/types/scheduledAction';
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
  const [activeTab, setActiveTab] = useState<TabType>('access');
  const [accessStep, setAccessStep] = useState<AccessStep>('source');
  const [contentSourceType, setContentSourceType] = useState<ContentSourceType>(null);
  const [isBookmarkSelectionMode, setIsBookmarkSelectionMode] = useState(false);
  const [isNotificationsSelectionMode, setIsNotificationsSelectionMode] = useState(false);
  const [isRemindersCreatorOpen, setIsRemindersCreatorOpen] = useState(false);
  const [isBookmarkFormOpen, setIsBookmarkFormOpen] = useState(false);
  const [bookmarkClearSignal, setBookmarkClearSignal] = useState(0);
  const [notificationsClearSignal, setNotificationsClearSignal] = useState(0);
  const [shortcutUrlFromBookmark, setShortcutUrlFromBookmark] = useState<string | null>(null);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [pendingSharedUrl, setPendingSharedUrl] = useState<string | null>(null);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [activeActionsCount, setActiveActionsCount] = useState(() => getActiveCount());
  const [pendingReminderDestination, setPendingReminderDestination] = useState<ScheduledActionDestination | null>(null);
  const lastSharedIdRef = useRef<string | null>(null);
  const previousTabRef = useRef<TabType>('access');

  // Onboarding state
  const { isComplete: onboardingComplete, hasSelectedLanguage, markLanguageSelected, currentStep, nextStep, skipOnboarding, completeOnboarding } = useOnboarding();

  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { closeTopSheet } = useSheetRegistry();
  
  // Enable auto-sync when user is signed in
  useAutoSync();
  
  // Handle native OAuth deep links
  useDeepLink();
  
  // Handle shared content from Android Share Sheet (always active regardless of tab)
  const { sharedContent, sharedAction, isLoading: isLoadingShared, clearSharedContent } = useSharedContent();
  
  // Check if shortlist has items
  const hasShortlist = getShortlistedLinks().length > 0;

  // Subscribe to scheduled actions changes for badge
  useEffect(() => {
    const updateCount = () => setActiveActionsCount(getActiveCount());
    const unsubscribe = onScheduledActionsChange(updateCount);
    return unsubscribe;
  }, []);

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
  const showBottomNav = accessStep === 'source' || activeTab === 'reminders' || activeTab === 'bookmarks' || activeTab === 'profile';

  // Tab order for swipe navigation
  const tabOrder: TabType[] = useMemo(() => ['access', 'reminders', 'bookmarks', 'profile'], []);
  
  // Swipe is only enabled on home screens (source step for access, or bookmarks/profile tabs without selection mode or open forms)
  const swipeEnabled = showBottomNav && !isBookmarkSelectionMode && !isNotificationsSelectionMode && !isRemindersCreatorOpen && !isBookmarkFormOpen;
  
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

  // Show language selection first for new users
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
    <div className="min-h-screen bg-background flex flex-col overflow-hidden">
      {/* Access Tab Content */}
      {activeTab === 'access' && (
        <div 
          key={`access-${slideDirection}`}
          className={`flex-1 flex flex-col ${getSlideAnimation()}`}
          {...(accessStep === 'source' ? swipeHandlers : {})}
        >
          <AccessFlow
            onStepChange={handleAccessStepChange}
            onContentSourceTypeChange={handleContentSourceTypeChange}
            initialUrlForShortcut={shortcutUrlFromBookmark}
            onInitialUrlConsumed={handleInitialUrlConsumed}
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
          className={`flex-1 flex flex-col ${getSlideAnimation()}`}
          {...swipeHandlers}
        >
          <NotificationsPage
            onSelectionModeChange={setIsNotificationsSelectionMode}
            clearSelectionSignal={notificationsClearSignal}
            initialDestination={pendingReminderDestination}
            onInitialDestinationConsumed={() => setPendingReminderDestination(null)}
            onCreatorOpenChange={setIsRemindersCreatorOpen}
          />
        </div>
      )}

      {/* Bookmarks Tab Content */}
      {activeTab === 'bookmarks' && (
        <div 
          key={`bookmarks-${slideDirection}`}
          className={`flex-1 flex flex-col ${getSlideAnimation()}`}
          {...swipeHandlers}
        >
          <BookmarkLibrary
            onCreateShortcut={handleCreateShortcutFromBookmark}
            onSelectionModeChange={setIsBookmarkSelectionMode}
            clearSelectionSignal={bookmarkClearSignal}
            onAddFormOpenChange={setIsBookmarkFormOpen}
          />
        </div>
      )}

      {/* Profile Tab Content */}
      {activeTab === 'profile' && (
        <div 
          key={`profile-${slideDirection}`}
          className={`flex-1 flex flex-col ${getSlideAnimation()}`}
          {...swipeHandlers}
        >
          <ProfilePage />
        </div>
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
            <AlertDialogDescription>
              {t('app.exitDescription')}
            </AlertDialogDescription>
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
          onDismiss={handleDismissSharedUrl}
        />
      )}
    </div>
  );
};

export default Index;
