import { Bookmark, Globe, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SavedLink } from '@/lib/savedLinksManager';

interface BookmarkItemProps {
  link: SavedLink;
  onTap: () => void;
}

function extractFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
  } catch {
    return '';
  }
}

export function BookmarkItem({ link, onTap }: BookmarkItemProps) {
  const faviconUrl = extractFaviconUrl(link.url);
  
  return (
    <button
      onClick={onTap}
      className={cn(
        "w-full flex items-start gap-3 p-4 rounded-xl",
        "bg-card hover:bg-muted/50",
        "active:scale-[0.98] transition-all",
        "text-left group border border-border/50"
      )}
    >
      {/* Favicon or fallback icon */}
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted overflow-hidden">
        {faviconUrl ? (
          <img 
            src={faviconUrl} 
            alt="" 
            className="h-6 w-6 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <Globe className={cn("h-5 w-5 text-muted-foreground", faviconUrl && "hidden")} />
        
        {/* Shortlist indicator */}
        {link.isShortlisted && (
          <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
            <Star className="h-2.5 w-2.5 text-primary-foreground fill-current" />
          </div>
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{link.title}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{link.url}</p>
        {link.description && (
          <p className="text-xs text-muted-foreground/80 mt-1.5 line-clamp-2">
            {link.description}
          </p>
        )}
        {link.tag && (
          <div className="mt-2">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
              {link.tag}
            </Badge>
          </div>
        )}
      </div>
    </button>
  );
}
