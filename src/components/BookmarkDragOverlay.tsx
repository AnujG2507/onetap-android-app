import { useMemo } from 'react';
import { Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { isValidImageSource } from '@/lib/imageUtils';
import type { SavedLink } from '@/lib/savedLinksManager';

interface BookmarkDragOverlayProps {
  link: SavedLink;
}

function extractFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
  } catch {
    return '';
  }
}

export function BookmarkDragOverlay({ link }: BookmarkDragOverlayProps) {
  const faviconUrl = extractFaviconUrl(link.url);
  
  // Validate favicon URL before attempting to load
  const validFaviconUrl = useMemo(() => 
    faviconUrl && isValidImageSource(faviconUrl) ? faviconUrl : null,
  [faviconUrl]);
  
  return (
    <div
      className={cn(
        "w-full flex items-start gap-2 p-4 rounded-xl",
        "bg-card border-2 border-primary shadow-2xl",
        "scale-105 rotate-1",
        "cursor-grabbing"
      )}
    >
      {/* Checkbox placeholder */}
      <div className="flex items-center justify-center pt-1 opacity-50">
        <Checkbox 
          checked={link.isShortlisted || false}
          className="h-5 w-5"
          disabled
        />
      </div>
      
      {/* Favicon or fallback icon */}
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted overflow-hidden">
        {validFaviconUrl ? (
          <ImageWithFallback
            sources={[validFaviconUrl]}
            fallback={<Globe className="h-5 w-5 text-muted-foreground" />}
            alt=""
            className="h-6 w-6 object-contain"
            containerClassName="flex items-center justify-center"
            showSkeleton={false}
          />
        ) : (
          <Globe className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{link.title}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{link.url}</p>
        {link.tag && (
          <div className="mt-2">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
              {link.tag}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}