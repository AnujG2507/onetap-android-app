import { useMemo } from 'react';
import { formatContentInfo } from '@/lib/contentResolver';
import { detectPlatform } from '@/lib/platformIcons';
import { PlatformIcon } from '@/components/PlatformIcon';
import type { ContentSource } from '@/types/shortcut';
import { cn } from '@/lib/utils';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { buildImageSources } from '@/lib/imageUtils';

interface ContentPreviewProps {
  source: ContentSource;
  className?: string;
}

export function ContentPreview({ source, className }: ContentPreviewProps) {
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
    return buildImageSources(source.uri, source.thumbnailData);
  }, [isImage, source.uri, source.thumbnailData]);

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
    </div>
  );
}