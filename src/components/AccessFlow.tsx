import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, WifiOff } from 'lucide-react';
import { ContentSourcePicker, ContactMode, ActionMode } from '@/components/ContentSourcePicker';
import { UrlInput } from '@/components/UrlInput';
import { ShortcutCustomizer } from '@/components/ShortcutCustomizer';
import { ContactShortcutCustomizer } from '@/components/ContactShortcutCustomizer';
import { SlideshowCustomizer } from '@/components/SlideshowCustomizer';
import { SuccessScreen } from '@/components/SuccessScreen';
import { ClipboardSuggestion } from '@/components/ClipboardSuggestion';
import { AppMenu } from '@/components/AppMenu';
import { TrashSheet } from '@/components/TrashSheet';
import { SavedLinksSheet } from '@/components/SavedLinksSheet';
import { MyShortcutsButton } from '@/components/MyShortcutsButton';
import { SettingsPage } from '@/components/SettingsPage';
import { TutorialCoachMarks } from '@/components/TutorialCoachMarks';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useClipboardDetection } from '@/hooks/useClipboardDetection';
import { useSettings } from '@/hooks/useSettings';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { useTutorial } from '@/hooks/useTutorial';
import { useOrientation } from '@/hooks/useOrientation';
import { useToast } from '@/hooks/use-toast';
import { pickFile, pickMultipleImages, FileTypeFilter } from '@/lib/contentResolver';
import { createHomeScreenShortcut } from '@/lib/shortcutManager';
import type { ContentSource, ShortcutIcon, MessageApp, MultiFileSource } from '@/types/shortcut';
import type { ScheduledActionDestination } from '@/types/scheduledAction';

export type AccessStep = 'source' | 'url' | 'customize' | 'slideshow-customize' | 'contact' | 'success';
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
  /** Called when user wants to create a reminder with initial destination */
  onCreateReminder?: (destination: ScheduledActionDestination) => void;
  /** Called when the inline content picker is opened or closed */
  onPickerOpenChange?: (isOpen: boolean) => void;
}

export function AccessFlow({ 
  onStepChange, 
  onContentSourceTypeChange,
  initialUrlForShortcut,
  onInitialUrlConsumed,
  onGoToBookmarks,
  onGoToNotifications,
  onCreateReminder,
  onPickerOpenChange,
}: AccessFlowProps) {
  const [step, setStep] = useState<AccessStep>('source');
  const [contentSource, setContentSource] = useState<ContentSource | null>(null);
  const [slideshowSource, setSlideshowSource] = useState<MultiFileSource | null>(null);
  const [lastCreatedName, setLastCreatedName] = useState('');
  const [contactData, setContactData] = useState<ContactData | null>(null);
  const [contactMode, setContactMode] = useState<ContactMode>('dial');
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [showBookmarkPicker, setShowBookmarkPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingActionMode, setPendingActionMode] = useState<ActionMode>('shortcut');
  const [isInlinePickerOpen, setIsInlinePickerOpen] = useState(false);
  const processedInitialUrlRef = useRef<string | null>(null);

  const { t } = useTranslation();
  const { createShortcut, createContactShortcut, createSlideshowShortcut } = useShortcuts();
  const { toast } = useToast();
  const { settings } = useSettings();
  const { isOnline } = useNetworkStatus();
  const { isLandscape } = useOrientation();
  const tutorial = useTutorial('access');

  // Auto-detect clipboard URL (only on source screen and if enabled in settings)
  const clipboardEnabled = step === 'source' && settings.clipboardDetectionEnabled;
  const { detectedUrl, dismissDetection } = useClipboardDetection(clipboardEnabled);

  // Register sheets with back button handler
  const handleCloseTrash = useCallback(() => setIsTrashOpen(false), []);
  const handleCloseBookmarkPicker = useCallback(() => setShowBookmarkPicker(false), []);
  const handleCloseSettings = useCallback(() => setShowSettings(false), []);

  const handleReset = useCallback(() => {
    setStep('source');
    setContentSource(null);
    setSlideshowSource(null);
    setContactData(null);
    setLastCreatedName('');
    setPendingActionMode('shortcut');
  }, []);

  // Consolidated back navigation handler
  const handleGoBack = useCallback(() => {
    switch (step) {
      case 'url':
        setStep('source');
        setContentSource(null);
        setPendingActionMode('shortcut');
        break;
      case 'customize':
        if (contentSource?.type === 'url') {
          setStep('url');
        } else {
          setStep('source');
          setContentSource(null);
        }
        break;
      case 'slideshow-customize':
        setStep('source');
        setSlideshowSource(null);
        break;
      case 'contact':
        setStep('source');
        setContactData(null);
        setContentSource(null);
        setPendingActionMode('shortcut');
        break;
      case 'success':
        handleReset();
        break;
      default:
        break;
    }
  }, [step, contentSource?.type, handleReset]);
  
  useSheetBackHandler('access-trash-sheet', isTrashOpen, handleCloseTrash);
  useSheetBackHandler('access-bookmark-picker', showBookmarkPicker, handleCloseBookmarkPicker);
  useSheetBackHandler('access-settings-page', showSettings, handleCloseSettings);

  // Register journey steps with back handler (priority 10 to intercept before Index fallback)
  useSheetBackHandler('access-url-step', step === 'url', handleGoBack, 10);
  useSheetBackHandler('access-customize-step', step === 'customize', handleGoBack, 10);
  useSheetBackHandler('access-slideshow-step', step === 'slideshow-customize', handleGoBack, 10);
  useSheetBackHandler('access-contact-step', step === 'contact', handleGoBack, 10);
  useSheetBackHandler('access-success-step', step === 'success', handleReset, 10);

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

  const handleClipboardCreateShortcut = (url: string) => {
    dismissDetection();
    setContentSource({
      type: 'url',
      uri: url,
    });
    setStep('customize');
  };

  const handleClipboardSaveToLibrary = (url: string, data?: { title?: string; description?: string; tag?: string | null }) => {
    dismissDetection();
    // Import and use addSavedLink from savedLinksManager
    import('@/lib/savedLinksManager').then(({ addSavedLink }) => {
      const result = addSavedLink(url, data?.title, data?.description, data?.tag);
      if (result.status === 'added' || result.status === 'duplicate') {
        toast({
          title: result.status === 'added' ? t('toasts.linkSaved') : t('toasts.linkDuplicate'),
        });
      } else {
        toast({
          title: t('toasts.linkFailed'),
          variant: 'destructive',
        });
      }
    });
  };

  const handleClipboardCreateReminder = (url: string) => {
    dismissDetection();
    try {
      const hostname = new URL(url).hostname.replace('www.', '');
      const destination: ScheduledActionDestination = {
        type: 'url',
        uri: url,
        name: hostname,
      };
      onCreateReminder?.(destination);
    } catch {
      onCreateReminder?.({
        type: 'url',
        uri: url,
        name: 'Link',
      });
    }
  };

  const handleSelectFromLibrary = (actionMode: ActionMode) => {
    setPendingActionMode(actionMode);
    setShowBookmarkPicker(true);
  };

  const handleBookmarkSelected = (url: string) => {
    setShowBookmarkPicker(false);
    
    if (pendingActionMode === 'reminder') {
      // Create reminder destination and navigate to notifications
      try {
        const hostname = new URL(url).hostname.replace('www.', '');
        const destination: ScheduledActionDestination = {
          type: 'url',
          uri: url,
          name: hostname,
        };
        onCreateReminder?.(destination);
      } catch {
        onCreateReminder?.({
          type: 'url',
          uri: url,
          name: 'Bookmark',
        });
      }
    } else {
      setContentSource({
        type: 'url',
        uri: url,
      });
      setStep('customize');
    }
  };

  const handleEnterUrl = (actionMode: ActionMode) => {
    setPendingActionMode(actionMode);
    setStep('url');
  };

  const handleUrlSubmit = (url: string) => {
    if (pendingActionMode === 'reminder') {
      // Create reminder destination and navigate to notifications
      try {
        const hostname = new URL(url).hostname.replace('www.', '');
        const destination: ScheduledActionDestination = {
          type: 'url',
          uri: url,
          name: hostname,
        };
        onCreateReminder?.(destination);
      } catch {
        // Invalid URL, still try
        onCreateReminder?.({
          type: 'url',
          uri: url,
          name: 'Link',
        });
      }
    } else {
      setContentSource({
        type: 'url',
        uri: url,
      });
      setStep('customize');
    }
  };

  const handleSelectFile = async (filter: FileTypeFilter, actionMode: ActionMode) => {
    // Use multi-image picker for images when creating shortcuts (not reminders)
    if (filter === 'image' && actionMode === 'shortcut') {
      // Show hint about multi-selection before picker opens
      toast({ 
        title: t('slideshow.multiSelectHint', 'Select multiple photos to create a slideshow shortcut'),
        duration: 4000,
      });
      
      const result = await pickMultipleImages();
      
      if (result && result.files.length > 1) {
        // Multiple images selected - route to slideshow customizer
        toast({ title: t('slideshow.creatingSlideshow', { count: result.files.length }) });
        setSlideshowSource(result);
        setStep('slideshow-customize');
        return;
      } else if (result && result.files.length === 1) {
        // Single image - use existing flow
        console.log('[AccessFlow] Single image selected from multi-picker');
        setContentSource({
          type: 'file',
          uri: result.files[0].uri,
          mimeType: result.files[0].mimeType,
          name: result.files[0].name,
        });
        setStep('customize');
        return;
      }
      // User cancelled
      return;
    }
    
    // Standard single-file flow for all other cases
    const file = await pickFile(filter);
    if (file) {
      console.log('[AccessFlow] File selected:', {
        name: file.name,
        size: file.fileSize,
        mimeType: file.mimeType,
        hasFileData: !!file.fileData,
      });
      
      if (actionMode === 'reminder') {
        // Create reminder destination and navigate to notifications
        const destination: ScheduledActionDestination = {
          type: 'file',
          uri: file.uri,
          name: file.name || 'File',
          mimeType: file.mimeType,
        };
        onCreateReminder?.(destination);
      } else {
        setContentSource(file);
        setStep('customize');
      }
    }
  };

  const handleSelectContact = (mode: ContactMode, actionMode: ActionMode) => {
    setContactMode(mode);
    setPendingActionMode(actionMode);
    setContactData(null);
    setStep('contact');
  };

  const handleContactConfirm = async (data: {
    name: string;
    icon: ShortcutIcon;
    phoneNumber: string;
    messageApp?: MessageApp;
    quickMessages?: string[];
  }) => {
    // If pending action is reminder, create reminder instead
    if (pendingActionMode === 'reminder') {
      const destination: ScheduledActionDestination = {
        type: 'contact',
        phoneNumber: data.phoneNumber,
        contactName: data.name,
        // For WhatsApp reminders, include message data
        isWhatsApp: !!data.messageApp && data.messageApp === 'whatsapp',
        quickMessage: data.quickMessages?.[0], // For reminders, use first message if any
      };
      onCreateReminder?.(destination);
      handleReset();
      return;
    }
    
    try {
      const shortcut = createContactShortcut(
        contactMode === 'dial' ? 'contact' : 'message',
        data.name,
        data.icon,
        data.phoneNumber,
        data.messageApp,
        data.quickMessages
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

  const handleSlideshowConfirm = async (
    images: Array<{ uri: string; thumbnail?: string }>,
    name: string,
    icon: ShortcutIcon,
    autoAdvanceInterval?: number
  ) => {
    try {
      const shortcut = createSlideshowShortcut(images, name, icon, autoAdvanceInterval);
      
      const success = await createHomeScreenShortcut(shortcut);

      if (success) {
        setLastCreatedName(name);
        setStep('success');
      } else {
        console.error('[AccessFlow] Failed to create slideshow shortcut');
        toast({
          title: 'Something went wrong',
          description: 'Could not add slideshow to home screen. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[AccessFlow] Slideshow shortcut creation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not create this slideshow shortcut.';
      toast({
        title: 'Unable to add',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  // Show settings page
  if (showSettings) {
    return <SettingsPage onBack={() => setShowSettings(false)} />;
  }

  return (
    <>
      {step === 'source' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Offline indicator banner */}
          {!isOnline && (
            <div className="bg-muted/80 border-b border-border ps-5 pe-5 py-2 flex items-center gap-2 shrink-0">
              <WifiOff className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {t('access.offline')}
              </span>
            </div>
          )}

          <header className="ps-5 pe-5 pt-header-safe pb-4 shrink-0">
            <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <Zap className="h-4 w-4 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-semibold text-foreground">{t('access.title')}</h1>
            </div>
              <AppMenu onOpenTrash={() => setIsTrashOpen(true)} onOpenSettings={() => setShowSettings(true)} />
            </div>
          </header>
          
          {/* Scrollable content area - ContentSourcePicker handles its own padding */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ContentSourcePicker
              onSelectFile={handleSelectFile}
              onSelectContact={handleSelectContact}
              onSelectFromLibrary={handleSelectFromLibrary}
              onEnterUrl={handleEnterUrl}
              onPickerOpenChange={(isOpen) => {
                setIsInlinePickerOpen(isOpen);
                onPickerOpenChange?.(isOpen);
              }}
            />
          </div>
          
          {/* Fixed My Shortcuts Button - hidden in landscape mode or when inline picker is open */}
          {!isInlinePickerOpen && !isLandscape && (
            <div
              id="my-shortcuts-fixed"
              className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] left-0 right-0 px-5 z-10"
            >
              <MyShortcutsButton />
            </div>
          )}

          {/* Clipboard URL auto-detection */}
          {detectedUrl && (
            <ClipboardSuggestion
              url={detectedUrl}
              onCreateShortcut={handleClipboardCreateShortcut}
              onSaveToLibrary={handleClipboardSaveToLibrary}
              onCreateReminder={handleClipboardCreateReminder}
              onDismiss={dismissDetection}
            />
          )}

          {/* Tutorial Coach Marks */}
          {tutorial.isActive && (
            <TutorialCoachMarks
              steps={tutorial.steps}
              currentStep={tutorial.currentStep}
              onNext={tutorial.next}
              onDismiss={tutorial.skip}
            />
          )}
        </div>
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

      {step === 'slideshow-customize' && slideshowSource && (
        <SlideshowCustomizer
          source={slideshowSource}
          onConfirm={handleSlideshowConfirm}
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

      {/* Trash Sheet (controlled from menu) */}
      <TrashSheet 
        open={isTrashOpen} 
        onOpenChange={setIsTrashOpen}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Bookmark Picker Sheet */}
      <SavedLinksSheet
        open={showBookmarkPicker}
        onOpenChange={setShowBookmarkPicker}
        onSelectLink={handleBookmarkSelected}
        onGoToBookmarks={onGoToBookmarks}
      />
    </>
  );
}
