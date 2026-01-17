import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { ContentSourcePicker } from '@/components/ContentSourcePicker';
import { UrlInput } from '@/components/UrlInput';
import { ShortcutCustomizer } from '@/components/ShortcutCustomizer';
import { SuccessScreen } from '@/components/SuccessScreen';
import { ClipboardSuggestion } from '@/components/ClipboardSuggestion';
import { SettingsSheet } from '@/components/SettingsSheet';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useBackButton } from '@/hooks/useBackButton';
import { useSharedContent } from '@/hooks/useSharedContent';
import { useClipboardDetection } from '@/hooks/useClipboardDetection';
import { useSettings } from '@/hooks/useSettings';
import { useToast } from '@/hooks/use-toast';
import { pickFile, FileTypeFilter } from '@/lib/contentResolver';
import { createHomeScreenShortcut } from '@/lib/shortcutManager';
import type { ContentSource, ShortcutIcon } from '@/types/shortcut';

type Step = 'source' | 'url' | 'customize' | 'success';

const Index = () => {
  const [step, setStep] = useState<Step>('source');
  const [contentSource, setContentSource] = useState<ContentSource | null>(null);
  const [lastCreatedName, setLastCreatedName] = useState('');
  const lastSharedIdRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const { createShortcut } = useShortcuts();
  const { toast } = useToast();
  const { sharedContent, sharedAction, isLoading: isLoadingShared, clearSharedContent } = useSharedContent();
  const { settings } = useSettings();
  
  // Auto-detect clipboard URL (only on source screen and if enabled in settings)
  const clipboardEnabled = step === 'source' && settings.clipboardDetectionEnabled;
  const { detectedUrl, dismissDetection } = useClipboardDetection(clipboardEnabled);

  const handleClipboardUse = (url: string) => {
    dismissDetection();
    setPrefillUrl(url);
    setStep('url');
  };

  // Handle shared content from Android Share Sheet AND internal video fallback
  // ALWAYS override current state when new share arrives (even on success screen)
  useEffect(() => {
    if (!isLoadingShared && sharedContent) {
      const isVideoFile =
        sharedContent.type === 'file' && !!sharedContent.mimeType && sharedContent.mimeType.startsWith('video/');

      // Internal video fallback: jump straight to the player.
      // Some OEMs/launchers/providers may not preserve the action reliably; in that case sharedAction can be null.
      // We only auto-play when action is PLAY_VIDEO OR when action is missing but the payload is a video file.
      const shouldAutoPlayVideo = sharedAction === 'app.onetap.PLAY_VIDEO' || (sharedAction == null && isVideoFile);

      if (shouldAutoPlayVideo && sharedContent.type === 'file') {
        // On Android, prefer native playback (more reliable than WebView <video>).
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
              // Clear after we've launched the player to avoid repeated re-opens.
              clearSharedContent();
            }
          })();

          return;
        }

        const uri = encodeURIComponent(sharedContent.uri);
        const type = encodeURIComponent(sharedContent.mimeType || 'video/*');
        // Add nonce to force fresh navigation/player initialization on repeated taps
        const nonce = Date.now();
        console.log('[Index] Video open detected, navigating to player:', { action: sharedAction, uri: sharedContent.uri, type: sharedContent.mimeType, nonce });

        // Navigate first (preserve any one-time URI grants during cold start).
        // NOTE: We intentionally do NOT clear the native intent here.
        // Clearing too early can revoke transient URI permissions on some devices.
        // The VideoPlayer will clear it after it has successfully resolved the file.
        navigate(`/player?uri=${uri}&type=${type}&t=${nonce}`);
        return;
      }

      // Create unique ID for this share
      const shareId = `${sharedContent.uri}-${sharedContent.type}`;

      // Check if we already processed this exact share
      if (lastSharedIdRef.current === shareId) {
        console.log('[Index] Already processed this share, skipping');
        return;
      }

      console.log('[Index] Processing shared content (override mode):', sharedContent);
      lastSharedIdRef.current = shareId;

      // Reset state and process new share
      setContentSource(sharedContent);
      setStep('customize');
      clearSharedContent();
    }
  }, [sharedContent, sharedAction, isLoadingShared, clearSharedContent, navigate]);

  // Handle Android back button
  useBackButton({
    isHomeScreen: step === 'source',
    onBack: () => {
      console.log('[Index] Back button triggered, current step:', step);
      if (step === 'url') {
        setStep('source');
      } else if (step === 'customize') {
        if (contentSource?.type === 'url') {
          setStep('url');
        } else {
          setStep('source');
        }
      } else if (step === 'success') {
        setStep('source');
        setContentSource(null);
        setLastCreatedName('');
      }
    }
  });

  const handleSelectFile = async (filter: FileTypeFilter) => {
    const file = await pickFile(filter);
    if (file) {
      console.log('[Index] File selected:', {
        name: file.name,
        size: file.fileSize,
        mimeType: file.mimeType,
        hasFileData: !!file.fileData,
      });
      setContentSource(file);
      setStep('customize');
    }
  };

  const [prefillUrl, setPrefillUrl] = useState<string | undefined>();

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

  const handleConfirm = async (name: string, icon: ShortcutIcon, resumeEnabled?: boolean) => {
    if (!contentSource) return;
    
    // Create shortcut with file metadata (including resumeEnabled for PDFs)
    const shortcut = createShortcut(contentSource, name, icon, resumeEnabled);
    
    try {
      // Pass the file data to native for proper handling
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
        console.error('[Index] Failed to create shortcut');
        toast({
          title: 'Something went wrong',
          description: 'Could not add to home screen. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[Index] Shortcut creation error:', error);
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
    setLastCreatedName('');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {step === 'source' && (
        <>
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
          onBack={() => setStep('source')}
          initialUrl={prefillUrl}
        />
      )}
      
      {step === 'customize' && contentSource && (
        <ShortcutCustomizer
          source={contentSource}
          onConfirm={handleConfirm}
          onBack={() => {
            if (contentSource.type === 'url') {
              setStep('url');
            } else {
              setStep('source');
            }
          }}
        />
      )}
      
      {step === 'success' && (
        <SuccessScreen
          shortcutName={lastCreatedName}
          onDone={handleReset}
        />
      )}
    </div>
  );
};

export default Index;
