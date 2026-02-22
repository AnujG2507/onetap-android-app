import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { formatContentInfo } from '@/lib/contentResolver';
import { detectPlatform } from '@/lib/platformIcons';
import { PlatformIcon } from '@/components/PlatformIcon';
import type { ContentSource } from '@/types/shortcut';
import { cn } from '@/lib/utils';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { buildImageSources } from '@/lib/imageUtils';

interface ContentPreviewProps {
  source: ContentSource;
  onPreview?: () => void;
  className?: string;
}

export function ContentPreview({ source, onPreview, className }: ContentPreviewProps) {
  const { t } = useTranslation();
  const info = formatContentInfo(source);
  const isImage = source.mimeType?.startsWith('image/');

  // Detect platform for URL sources
  const platform = useMemo(() => {
    if (source.type === 'url' || source.type === 'share') {
      return detectPlatform(source.uri);
    }
    return null;
  }, [source.type, source.uri]);

  // Build priority-ordered list of image sources
  const imageSources = useMemo(() => {
    if (!isImage) return [];
    const sources = buildImageSources(source.thumbnailData, source.uri);
    console.log('[ContentPreview] Image sources:', {
      hasThumbnailData: !!source.thumbnailData,
      thumbnailDataLength: source.thumbnailData?.length,
      uri: source.uri?.substring(0, 50),
      resultCount: sources.length,
    });
    return sources;
  }, [isImage, source.thumbnailData, source.uri]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 landscape:gap-2 p-3 landscape:p-2 rounded-xl bg-muted/50 animate-fade-in",
        className
      )}
    >
      {/* Thumbnail, platform icon, or emoji */}
      <div 
        className={cn(
          "flex-shrink-0 h-12 w-12 landscape:h-10 landscape:w-10 rounded-lg overflow-hidden flex items-center justify-center",
          !platform && "bg-primary/10"
        )}
      >
        {platform ? (
          <PlatformIcon platform={platform} size="lg" />
        ) : isImage && imageSources.length > 0 ? (
          <ImageWithFallback
            sources={imageSources}
            fallback={<span className="text-2xl landscape:text-xl">{info.emoji}</span>}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-2xl landscape:text-xl">{info.emoji}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm landscape:text-xs font-medium text-foreground truncate">
          {info.label}
        </p>
        <p className="text-xs landscape:text-[10px] text-muted-foreground truncate">
          {info.sublabel}
        </p>
      </div>

      {/* Preview button */}
      {onPreview && (
        <button
          type="button"
          onClick={onPreview}
          className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted active:bg-muted/80 text-muted-foreground transition-colors"
          aria-label={t('shortcutCustomizer.previewContent')}
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}