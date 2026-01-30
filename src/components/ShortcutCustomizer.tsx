import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { IconPicker } from './IconPicker';
import { ContentPreview } from './ContentPreview';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { getContentName, generateThumbnail, getPlatformEmoji, getFileTypeEmoji } from '@/lib/contentResolver';
import { buildImageSources } from '@/lib/imageUtils';
import type { ContentSource, ShortcutIcon } from '@/types/shortcut';
import { FILE_SIZE_THRESHOLD } from '@/types/shortcut';

interface ShortcutCustomizerProps {
  source: ContentSource;
  onConfirm: (name: string, icon: ShortcutIcon, resumeEnabled?: boolean) => void;
  onBack: () => void;
}

// Threshold for showing progress indicator (10MB)
const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;

export function ShortcutCustomizer({ source, onConfirm, onBack }: ShortcutCustomizerProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(() => getContentName(source));
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [resumeEnabled, setResumeEnabled] = useState(false);
  
  // Check if this is a PDF file (robust detection)
  const isPdf = source.mimeType === 'application/pdf' || 
                source.mimeType?.includes('pdf') ||
                source.name?.toLowerCase().endsWith('.pdf') ||
                source.uri?.toLowerCase().split('?')[0].endsWith('.pdf');
  
  // Check if this is a video file
  const isVideo = source.mimeType?.startsWith('video/') || 
                  /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(source.name || '') ||
                  /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(source.uri || '');
  
  // Check if this is a large file that needs progress indicator
  const isLargeFile = (source.fileSize || 0) > LARGE_FILE_THRESHOLD;
  const fileSizeMB = source.fileSize ? (source.fileSize / (1024 * 1024)).toFixed(1) : null;
  
  // Get initial emoji based on source type - smart defaults
  const getInitialIcon = (): ShortcutIcon => {
    if (source.type === 'url' || source.type === 'share') {
      return { type: 'emoji', value: getPlatformEmoji(source.uri) };
    }
    // For files, use file-type specific emoji
    return { type: 'emoji', value: getFileTypeEmoji(source.mimeType, source.name) };
  };
  
  const [icon, setIcon] = useState<ShortcutIcon>(getInitialIcon);
  const [isLoadingThumbnail, setIsLoadingThumbnail] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [creationProgress, setCreationProgress] = useState(0);
  
  // Build priority-ordered list of preview image sources
  const previewSources = useMemo(() => {
    if (icon.type !== 'thumbnail') return [];
    return buildImageSources(icon.value, thumbnail);
  }, [icon.type, icon.value, thumbnail]);
  
  useEffect(() => {
    setIsLoadingThumbnail(true);
    generateThumbnail(source)
      .then((thumb) => {
        if (thumb) {
          setThumbnail(thumb);
          setIcon({ type: 'thumbnail', value: thumb });
        }
      })
      .finally(() => {
        setIsLoadingThumbnail(false);
      });
  }, [source]);
  
  // Simulate progress for large files during creation
  useEffect(() => {
    if (!isCreating || !isLargeFile) {
      setCreationProgress(0);
      return;
    }
    
    // Animate progress from 0 to 90% over ~3 seconds for large files
    const duration = isVideo ? 4000 : 2000;
    const interval = 50;
    const steps = duration / interval;
    const increment = 90 / steps;
    let currentProgress = 0;
    
    const timer = setInterval(() => {
      currentProgress += increment;
      if (currentProgress >= 90) {
        currentProgress = 90;
        clearInterval(timer);
      }
      setCreationProgress(currentProgress);
    }, interval);
    
    return () => clearInterval(timer);
  }, [isCreating, isLargeFile, isVideo]);
  
  const handleConfirm = useCallback(async () => {
    if (name.trim() && !isCreating) {
      setIsCreating(true);
      setCreationProgress(0);
      try {
        await onConfirm(name.trim(), icon, isPdf ? resumeEnabled : undefined);
        // Complete the progress on success
        setCreationProgress(100);
      } finally {
        // Small delay before resetting to show 100%
        setTimeout(() => {
          setIsCreating(false);
          setCreationProgress(0);
        }, 300);
      }
    }
  }, [name, isCreating, onConfirm, icon, isPdf, resumeEnabled]);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 p-4 pt-header-safe-compact border-b">
        <button
          onClick={onBack}
          className="p-2 -ms-2 rounded-full hover:bg-muted active:bg-muted/80"
        >
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
        <h2 className="text-lg font-medium">{t('shortcutCustomizer.setUpAccess')}</h2>
      </header>
      
      <div className="flex-1 p-4 space-y-8 overflow-auto animate-fade-in">
        {/* Content Preview */}
        <ContentPreview source={source} />
        
        {/* File size indicator for videos */}
        {isVideo && fileSizeMB && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/50">
            <span className="text-lg">🎬</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                {t('shortcutCustomizer.videoFile')}
              </p>
              <p className="text-xs text-muted-foreground">
                {fileSizeMB} MB {Number(fileSizeMB) > 50 ? `• ${t('shortcutCustomizer.largeFileWarning')}` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Name input */}
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('shortcutCustomizer.nameLabel')}
          </label>
          <div className="relative">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('shortcutCustomizer.namePlaceholder')}
              className="h-12 text-base pe-10"
              maxLength={30}
            />
            {name && (
              <button
                type="button"
                onClick={() => setName('')}
                className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        
        {/* Icon picker */}
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('shortcutCustomizer.iconLabel')}
          </label>
          <div className="relative">
            <IconPicker
              thumbnail={thumbnail || undefined}
              selectedIcon={icon}
              onSelect={setIcon}
            />
            {isLoadingThumbnail && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-xl">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
        
        {/* PDF Resume Toggle - only shown for PDFs */}
        {isPdf && (
          <div className="space-y-2">
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
              <div className="flex-1 me-4">
                <p className="font-medium text-foreground">{t('shortcutCustomizer.returnToLastPage')}</p>
                <p className="text-sm text-muted-foreground">{t('shortcutCustomizer.openWhereYouLeftOff')}</p>
              </div>
              <Switch
                checked={resumeEnabled}
                onCheckedChange={setResumeEnabled}
              />
            </div>
          </div>
        )}
        
        {/* Preview */}
        <div className="pt-6 border-t border-border">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground text-center mb-4">
            {t('shortcutCustomizer.preview')}
          </p>
          <div className="flex flex-col items-center gap-2">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center elevation-2 overflow-hidden relative"
              style={icon.type === 'thumbnail' ? {} : { backgroundColor: 'hsl(var(--primary))' }}
            >
              {isLoadingThumbnail && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!isLoadingThumbnail && icon.type === 'thumbnail' && previewSources.length > 0 && (
                <ImageWithFallback
                  sources={previewSources}
                  fallback={<span className="text-2xl">📱</span>}
                  alt=""
                  className="h-full w-full object-cover"
                  showSkeleton={false}
                />
              )}
              {!isLoadingThumbnail && icon.type === 'thumbnail' && previewSources.length === 0 && (
                <span className="text-2xl">📱</span>
              )}
              {!isLoadingThumbnail && icon.type === 'emoji' && (
                <span className="text-2xl">{icon.value}</span>
              )}
              {!isLoadingThumbnail && icon.type === 'text' && (
                <span className="text-xl font-bold text-primary-foreground">
                  {icon.value.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <span className="text-xs text-foreground max-w-[72px] text-center truncate">
              {name || t('shortcutCustomizer.access')}
            </span>
          </div>
        </div>
      </div>
      
      <div className="p-4 safe-bottom space-y-3">
        {/* Progress indicator for large files */}
        {isCreating && isLargeFile && (
          <div className="space-y-3 p-4 rounded-xl bg-muted/30 border border-border/50 animate-fade-in">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">
                {isVideo ? t('shortcutCustomizer.processingVideo') : t('shortcutCustomizer.processingFile')}
              </span>
              <span className="text-muted-foreground">{Math.round(creationProgress)}%</span>
            </div>
            <Progress value={creationProgress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">
              {isVideo 
                ? t('shortcutCustomizer.processingLargeVideo', { size: fileSizeMB })
                : t('shortcutCustomizer.processingLargeFile', { size: fileSizeMB })}
            </p>
          </div>
        )}
        
        <Button
          onClick={handleConfirm}
          disabled={!name.trim() || isCreating}
          className="w-full h-12 text-base font-medium"
        >
          {isCreating ? (
            <>
              <Loader2 className="me-2 h-5 w-5 animate-spin" />
              {isLargeFile && isVideo 
                ? t('shortcutCustomizer.addingVideo')
                : t('shortcutCustomizer.adding')}
            </>
          ) : (
            <>
              <Check className="me-2 h-5 w-5" />
              {t('shortcutCustomizer.addToHomeScreen')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
