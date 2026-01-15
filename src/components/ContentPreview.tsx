import { formatContentInfo, detectFileType } from '@/lib/contentResolver';
import type { ContentSource } from '@/types/shortcut';
import { cn } from '@/lib/utils';

interface ContentPreviewProps {
  source: ContentSource;
  className?: string;
}

export function ContentPreview({ source, className }: ContentPreviewProps) {
  const info = formatContentInfo(source);
  const isImage = source.mimeType?.startsWith('image/');
  const fileType = detectFileType(source.mimeType, source.name);

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl bg-muted/50 animate-fade-in",
        className
      )}
    >
      {/* Thumbnail or emoji icon */}
      <div className="flex-shrink-0 h-12 w-12 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center">
        {isImage && source.uri ? (
          <img
            src={source.uri}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-2xl">{info.emoji}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {info.label}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {info.sublabel}
        </p>
      </div>
    </div>
  );
}
