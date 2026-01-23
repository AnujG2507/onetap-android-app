import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, WifiOff } from 'lucide-react';
import { ContentSourcePicker, ContactMode } from '@/components/ContentSourcePicker';
import { UrlInput } from '@/components/UrlInput';
import { ShortcutCustomizer } from '@/components/ShortcutCustomizer';
import { ContactShortcutCustomizer } from '@/components/ContactShortcutCustomizer';
import { SuccessScreen } from '@/components/SuccessScreen';
import { ClipboardSuggestion } from '@/components/ClipboardSuggestion';
import { AppMenu } from '@/components/AppMenu';
import { TrashSheet } from '@/components/TrashSheet';
import { SavedLinksSheet } from '@/components/SavedLinksSheet';
import { ScheduledActionsList } from '@/components/ScheduledActionsList';
import { ScheduledActionCreator } from '@/components/ScheduledActionCreator';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useClipboardDetection } from '@/hooks/useClipboardDetection';
import { useSettings } from '@/hooks/useSettings';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useScheduledActions } from '@/hooks/useScheduledActions';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { useToast } from '@/hooks/use-toast';
import { pickFile, FileTypeFilter } from '@/lib/contentResolver';
import { createHomeScreenShortcut } from '@/lib/shortcutManager';
import type { ContentSource, ShortcutIcon, MessageApp } from '@/types/shortcut';

export type AccessStep = 'source' | 'url' | 'customize' | 'contact' | 'success' | 'scheduled-list' | 'scheduled-create';
export type ContentSourceType = 'url' | 'file' | null;

interface ContactData {
  name?: string;
  phoneNumber?: string;
  photoUri?: string;
}

interface AccessFlowProps {
  /** Called when the step changes (for back button handling) */
  onStepChange?: (step: AccessStep) => void;
  /** Called when content source type changes (for back navigation) */
  onContentSourceTypeChange?: (type: ContentSourceType) => void;
  /** URL to create shortcut from (e.g., from bookmark library) */
  initialUrlForShortcut?: string | null;
  /** Called when the initial URL has been consumed */
  onInitialUrlConsumed?: () => void;
  /** Called when user wants to navigate to bookmarks tab */
  onGoToBookmarks?: () => void;
  /** Called when user wants to navigate to notifications tab */
  onGoToNotifications?: () => void;
}

export function AccessFlow({ 
  onStepChange, 
  onContentSourceTypeChange,
  initialUrlForShortcut,
  onInitialUrlConsumed,
  onGoToBookmarks,
  onGoToNotifications,
}: AccessFlowProps) {
  const [step, setStep] = useState<AccessStep>('source');
  const [contentSource, setContentSource] = useState<ContentSource | null>(null);
  const [lastCreatedName, setLastCreatedName] = useState('');
  const [contactData, setContactData] = useState<ContactData | null>(null);
  const [contactMode, setContactMode] = useState<ContactMode>('dial');
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [showBookmarkPicker, setShowBookmarkPicker] = useState(false);
  const processedInitialUrlRef = useRef<string | null>(null);

  const { createShortcut, createContactShortcut } = useShortcuts();
  const { toast } = useToast();
  const { settings } = useSettings();
  const { isOnline } = useNetworkStatus();
  const { activeCount: scheduledCount } = useScheduledActions();

  // Auto-detect clipboard URL (only on source screen and if enabled in settings)
  const clipboardEnabled = step === 'source' && settings.clipboardDetectionEnabled;
  const { detectedUrl, dismissDetection } = useClipboardDetection(clipboardEnabled);

  // Scheduled actions state
  const [showScheduledList, setShowScheduledList] = useState(false);

  // Register sheets with back button handler
  const handleCloseTrash = useCallback(() => setIsTrashOpen(false), []);
  const handleCloseBookmarkPicker = useCallback(() => setShowBookmarkPicker(false), []);
  const handleCloseScheduledList = useCallback(() => setShowScheduledList(false), []);
  
  useSheetBackHandler('access-trash-sheet', isTrashOpen, handleCloseTrash);
  useSheetBackHandler('access-bookmark-picker', showBookmarkPicker, handleCloseBookmarkPicker);
  useSheetBackHandler('access-scheduled-list', showScheduledList, handleCloseScheduledList);

  // Notify parent of step changes
  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  // Notify parent of content source type changes
  useEffect(() => {
    const type: ContentSourceType = contentSource?.type === 'url' ? 'url' : contentSource ? 'file' : null;
    onContentSourceTypeChange?.(type);
  }, [contentSource, onContentSourceTypeChange]);

  // Handle initial URL for shortcut creation (from bookmark library)
  useEffect(() => {
    if (initialUrlForShortcut && processedInitialUrlRef.current !== initialUrlForShortcut) {
      console.log('[AccessFlow] Processing initial URL for shortcut:', initialUrlForShortcut);
      processedInitialUrlRef.current = initialUrlForShortcut;
      
      // Set the content source and navigate to customize step
      setContentSource({
        type: 'url',
        uri: initialUrlForShortcut,
      });
      setStep('customize');
      
      // Notify parent that we've consumed the URL
      onInitialUrlConsumed?.();
    }
  }, [initialUrlForShortcut, onInitialUrlConsumed]);

  const handleClipboardUse = (url: string) => {
    dismissDetection();
    setContentSource({
      type: 'url',
      uri: url,
    });
    setStep('customize');
  };

  const handleSelectFromLibrary = () => {
    setShowBookmarkPicker(true);
  };

  const handleBookmarkSelected = (url: string) => {
    setShowBookmarkPicker(false);
    setContentSource({
      type: 'url',
      uri: url,
    });
    setStep('customize');
  };

  const handleEnterUrl = () => {
    setStep('url');
  };

  const handleUrlSubmit = (url: string) => {
    setContentSource({
      type: 'url',
      uri: url,
    });
    setStep('customize');
  };

  const handleSelectFile = async (filter: FileTypeFilter) => {
    const file = await pickFile(filter);
    if (file) {
      console.log('[AccessFlow] File selected:', {
        name: file.name,
        size: file.fileSize,
        mimeType: file.mimeType,
        hasFileData: !!file.fileData,
      });
      setContentSource(file);
      setStep('customize');
    }
  };

  const handleSelectContact = (mode: ContactMode) => {
    setContactMode(mode);
    setContactData(null);
    setStep('contact');
  };

  const handleContactConfirm = async (data: {
    name: string;
    icon: ShortcutIcon;
    phoneNumber: string;
    messageApp?: MessageApp;
    slackTeamId?: string;
    slackUserId?: string;
  }) => {
    try {
      const shortcut = createContactShortcut(
        contactMode === 'dial' ? 'contact' : 'message',
        data.name,
        data.icon,
        data.phoneNumber,
        data.messageApp,
        data.slackTeamId && data.slackUserId
          ? { teamId: data.slackTeamId, userId: data.slackUserId }
          : undefined
      );

      const success = await createHomeScreenShortcut(shortcut);

      if (success) {
        setLastCreatedName(data.name);
        setStep('success');
      } else {
        toast({
          title: 'Something went wrong',
          description: 'Could not add to home screen. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[AccessFlow] Contact shortcut creation error:', error);
      toast({
        title: 'Unable to add',
        description: error instanceof Error ? error.message : 'Could not create this shortcut.',
        variant: 'destructive',
      });
    }
  };

  const handleConfirm = async (name: string, icon: ShortcutIcon, resumeEnabled?: boolean) => {
    if (!contentSource) return;

    const shortcut = createShortcut(contentSource, name, icon, resumeEnabled);

    try {
      const success = await createHomeScreenShortcut(shortcut, {
        fileData: contentSource.fileData,
        fileSize: contentSource.fileSize,
        thumbnailData: contentSource.thumbnailData,
        isLargeFile: contentSource.isLargeFile,
        mimeType: contentSource.mimeType,
      });

      if (success) {
        setLastCreatedName(name);
        setStep('success');
      } else {
        console.error('[AccessFlow] Failed to create shortcut');
        toast({
          title: 'Something went wrong',
          description: 'Could not add to home screen. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[AccessFlow] Shortcut creation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not create this shortcut. Please try again.';
      toast({
        title: 'Unable to add',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleReset = () => {
    setStep('source');
    setContentSource(null);
    setContactData(null);
    setLastCreatedName('');
  };

  // Consolidated back navigation handler
  const handleGoBack = () => {
    switch (step) {
      case 'url':
        setStep('source');
        setContentSource(null);
        break;
      case 'customize':
        if (contentSource?.type === 'url') {
          setStep('url');
        } else {
          setStep('source');
          setContentSource(null);
        }
        break;
      case 'contact':
        setStep('source');
        setContactData(null);
        setContentSource(null);
        break;
      case 'success':
        handleReset();
        break;
      case 'scheduled-create':
        setStep('source');
        break;
      default:
        break;
    }
  };

  // Scheduled action handlers
  const handleOpenScheduledList = () => setShowScheduledList(true);
  const handleCreateScheduled = () => {
    setShowScheduledList(false);
    setStep('scheduled-create');
  };
  const handleScheduledComplete = () => {
    setStep('source');
    setShowScheduledList(true); // Show the list after creation
  };


  return (
    <>
      {step === 'source' && (
        <>
          {/* Offline indicator banner */}
          {!isOnline && (
            <div className="bg-muted/80 border-b border-border px-5 py-2 flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                You're offline. Some features may be limited.
              </span>
            </div>
          )}

          <header className="px-5 pt-8 pb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                  <Plus className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="text-sm font-medium text-muted-foreground tracking-wide">OneTap</span>
              </div>
              <AppMenu onOpenTrash={() => setIsTrashOpen(true)} />
            </div>
            <h1 className="text-2xl font-semibold text-foreground leading-tight tracking-tight">
              One tap to what matters
            </h1>
          </header>
          <ContentSourcePicker
            onSelectFile={handleSelectFile}
            onSelectContact={handleSelectContact}
            onSelectFromLibrary={handleSelectFromLibrary}
            onEnterUrl={handleEnterUrl}
            onOpenScheduled={handleOpenScheduledList}
            scheduledCount={scheduledCount}
          />

          {/* Clipboard URL auto-detection */}
          {detectedUrl && (
            <ClipboardSuggestion
              url={detectedUrl}
              onUse={handleClipboardUse}
              onDismiss={dismissDetection}
            />
          )}
        </>
      )}

      {step === 'url' && (
        <UrlInput
          onSubmit={handleUrlSubmit}
          onBack={handleGoBack}
        />
      )}

      {step === 'customize' && contentSource && (
        <ShortcutCustomizer
          source={contentSource}
          onConfirm={handleConfirm}
          onBack={handleGoBack}
        />
      )}

      {step === 'contact' && (
        <ContactShortcutCustomizer
          mode={contactMode}
          contact={contactData || undefined}
          onConfirm={handleContactConfirm}
          onBack={handleGoBack}
        />
      )}

      {step === 'success' && (
        <SuccessScreen
          shortcutName={lastCreatedName}
          onDone={handleReset}
        />
      )}

      {step === 'scheduled-create' && (
        <ScheduledActionCreator
          onComplete={handleScheduledComplete}
          onBack={handleGoBack}
        />
      )}

      {/* Trash Sheet (controlled from menu) */}
      <TrashSheet 
        open={isTrashOpen} 
        onOpenChange={setIsTrashOpen} 
      />

      {/* Bookmark Picker Sheet */}
      <SavedLinksSheet
        open={showBookmarkPicker}
        onOpenChange={setShowBookmarkPicker}
        onSelectLink={handleBookmarkSelected}
        onGoToBookmarks={onGoToBookmarks}
      />

      {/* Scheduled Actions List Sheet */}
      <ScheduledActionsList
        isOpen={showScheduledList}
        onClose={() => setShowScheduledList(false)}
        onCreateNew={handleCreateScheduled}
        onGoToNotifications={onGoToNotifications}
      />
    </>
  );
}
