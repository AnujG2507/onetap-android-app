import { useState, useCallback } from 'react';
import { BottomNav, TabType } from '@/components/BottomNav';
import { BookmarkLibrary } from '@/components/BookmarkLibrary';
import { AccessFlow, AccessStep } from '@/components/AccessFlow';
import { useBackButton } from '@/hooks/useBackButton';
import { getShortlistedLinks, clearAllShortlist } from '@/lib/savedLinksManager';

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabType>('access');
  const [accessStep, setAccessStep] = useState<AccessStep>('source');
  const [contentSourceType, setContentSourceType] = useState<'url' | 'file' | null>(null);
  const [isBookmarkSelectionMode, setIsBookmarkSelectionMode] = useState(false);
  const [bookmarkClearSignal, setBookmarkClearSignal] = useState(0);

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
  const handleCreateShortcutFromBookmark = (url: string) => {
    setContentSourceType('url');
    setActiveTab('access');
    // The AccessFlow will handle the customize step when it receives shared content
  };

  // Track step and content type changes from AccessFlow
  const handleAccessStepChange = useCallback((step: AccessStep) => {
    setAccessStep(step);
  }, []);

  // Show bottom nav only on main screens (not during sub-flows)
  const showBottomNav = accessStep === 'source';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Access Tab Content */}
      {activeTab === 'access' && (
        <AccessFlow
          onStepChange={handleAccessStepChange}
        />
      )}

      {/* Bookmarks Tab Content */}
      {activeTab === 'bookmarks' && (
        <BookmarkLibrary
          onCreateShortcut={handleCreateShortcutFromBookmark}
          onSelectionModeChange={setIsBookmarkSelectionMode}
          clearSelectionSignal={bookmarkClearSignal}
        />
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
