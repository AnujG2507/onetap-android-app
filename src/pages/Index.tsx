import { useState, useCallback } from 'react';
import { BottomNav, TabType } from '@/components/BottomNav';
import { BookmarkLibrary } from '@/components/BookmarkLibrary';
import { AccessFlow, AccessStep, ContentSourceType } from '@/components/AccessFlow';
import { useBackButton } from '@/hooks/useBackButton';
import { getShortlistedLinks, clearAllShortlist } from '@/lib/savedLinksManager';

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabType>('access');
  const [accessStep, setAccessStep] = useState<AccessStep>('source');
  const [contentSourceType, setContentSourceType] = useState<ContentSourceType>(null);
  const [isBookmarkSelectionMode, setIsBookmarkSelectionMode] = useState(false);
  const [bookmarkClearSignal, setBookmarkClearSignal] = useState(0);
  const [shortcutUrlFromBookmark, setShortcutUrlFromBookmark] = useState<string | null>(null);

  // Check if shortlist has items
  const hasShortlist = getShortlistedLinks().length > 0;

  // Handle clearing bookmark selection
  const handleClearBookmarkSelection = useCallback(() => {
    clearAllShortlist();
    setBookmarkClearSignal(s => s + 1);
    setIsBookmarkSelectionMode(false);
  }, []);

  // Handle Android back button
  // Both access tab (at source step) and bookmarks tab (when not selecting) are "home" screens
  const isOnHomeScreen = (accessStep === 'source' && activeTab === 'access') ||
    (activeTab === 'bookmarks' && !isBookmarkSelectionMode);

  useBackButton({
    isHomeScreen: isOnHomeScreen,
    onBack: () => {
      console.log('[Index] Back button triggered, step:', accessStep, 'tab:', activeTab, 'selectionMode:', isBookmarkSelectionMode);

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
  const showBottomNav = accessStep === 'source';

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

      {/* Bottom Navigation */}
      {showBottomNav && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          hasShortlist={hasShortlist}
        />
      )}
    </div>
  );
};

export default Index;
