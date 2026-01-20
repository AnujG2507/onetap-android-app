import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import { useNavigate } from 'react-router-dom';
import { Plus, WifiOff } from 'lucide-react';
import { ContentSourcePicker, ContactMode } from '@/components/ContentSourcePicker';
import { UrlInput } from '@/components/UrlInput';
import { ShortcutCustomizer } from '@/components/ShortcutCustomizer';
import { ContactShortcutCustomizer } from '@/components/ContactShortcutCustomizer';
import { SuccessScreen } from '@/components/SuccessScreen';
import { ClipboardSuggestion } from '@/components/ClipboardSuggestion';
import { SettingsSheet } from '@/components/SettingsSheet';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useSharedContent } from '@/hooks/useSharedContent';
import { useClipboardDetection } from '@/hooks/useClipboardDetection';
import { useSettings } from '@/hooks/useSettings';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useToast } from '@/hooks/use-toast';
import { pickFile, FileTypeFilter } from '@/lib/contentResolver';
import { createHomeScreenShortcut } from '@/lib/shortcutManager';
import type { ContentSource, ShortcutIcon, MessageApp } from '@/types/shortcut';

export type AccessStep = 'source' | 'url' | 'customize' | 'contact' | 'success';
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
}

export function AccessFlow({ onStepChange, onContentSourceTypeChange }: AccessFlowProps) {
  const [step, setStep] = useState<AccessStep>('source');
  const [contentSource, setContentSource] = useState<ContentSource | null>(null);
  const [lastCreatedName, setLastCreatedName] = useState('');
  const [contactData, setContactData] = useState<ContactData | null>(null);
  const [contactMode, setContactMode] = useState<ContactMode>('dial');
  const [prefillUrl, setPrefillUrl] = useState<string | undefined>();
  const lastSharedIdRef = useRef<string | null>(null);

  const navigate = useNavigate();
  const { createShortcut, createContactShortcut } = useShortcuts();
  const { toast } = useToast();
  const { sharedContent, sharedAction, isLoading: isLoadingShared, clearSharedContent } = useSharedContent();
  const { settings } = useSettings();
  const { isOnline } = useNetworkStatus();

  // Auto-detect clipboard URL (only on source screen and if enabled in settings)
  const clipboardEnabled = step === 'source' && settings.clipboardDetectionEnabled;
  const { detectedUrl, dismissDetection } = useClipboardDetection(clipboardEnabled);

  // Notify parent of step changes
  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  // Notify parent of content source type changes
  useEffect(() => {
    const type: ContentSourceType = contentSource?.type === 'url' ? 'url' : contentSource ? 'file' : null;
    onContentSourceTypeChange?.(type);
  }, [contentSource, onContentSourceTypeChange]);

  const handleClipboardUse = (url: string) => {
    dismissDetection();
    setPrefillUrl(url);
    setStep('url');
  };

  // Handle shared content from Android Share Sheet AND internal video fallback
  useEffect(() => {
    if (!isLoadingShared && sharedContent) {
      const isVideoFile =
        sharedContent.type === 'file' && !!sharedContent.mimeType && sharedContent.mimeType.startsWith('video/');

      const shouldAutoPlayVideo = sharedAction === 'app.onetap.PLAY_VIDEO' || (sharedAction == null && isVideoFile);

      if (shouldAutoPlayVideo && sharedContent.type === 'file') {
        if (Capacitor.isNativePlatform()) {
          const mimeType = sharedContent.mimeType || 'video/*';
          console.log('[AccessFlow] Video open detected, opening native player:', {
            action: sharedAction,
            uri: sharedContent.uri,
            type: mimeType,
          });

          (async () => {
            try {
              await ShortcutPlugin.openNativeVideoPlayer({ uri: sharedContent.uri, mimeType });
            } catch (e) {
              console.error('[AccessFlow] Failed to open native player, falling back to web player:', e);
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
        console.log('[AccessFlow] Video open detected, navigating to player:', { action: sharedAction, uri: sharedContent.uri, type: sharedContent.mimeType, nonce });

        navigate(`/player?uri=${uri}&type=${type}&t=${nonce}`);
        return;
      }

      const shareId = `${sharedContent.uri}-${sharedContent.type}`;

      if (lastSharedIdRef.current === shareId) {
        console.log('[AccessFlow] Already processed this share, skipping');
        return;
      }

      console.log('[AccessFlow] Processing shared content (override mode):', sharedContent);
      lastSharedIdRef.current = shareId;

      setContentSource(sharedContent);
      setStep('customize');
      clearSharedContent();
    }
  }, [sharedContent, sharedAction, isLoadingShared, clearSharedContent, navigate]);

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

  const handleSelectUrl = (url?: string) => {
    setPrefillUrl(url);
    setStep('url');
  };

  const handleUrlSubmit = (url: string) => {
    setContentSource({
      type: 'url',
      uri: url,
    });
    setStep('customize');
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
    setPrefillUrl(undefined);
  };

  // Consolidated back navigation handler
  const handleGoBack = () => {
    switch (step) {
      case 'url':
        setStep('source');
        setContentSource(null);
        setPrefillUrl(undefined);
        break;
      case 'customize':
        if (contentSource?.type === 'url') {
          setStep('url');
          // Keep contentSource to preserve URL when going back to input
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
      default:
        break;
    }
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
              <SettingsSheet />
            </div>
            <h1 className="text-2xl font-semibold text-foreground leading-tight tracking-tight">
              One tap to what matters
            </h1>
          </header>
          <ContentSourcePicker
            onSelectFile={handleSelectFile}
            onSelectUrl={handleSelectUrl}
            onSelectContact={handleSelectContact}
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
          initialUrl={prefillUrl}
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
    </>
  );
}
